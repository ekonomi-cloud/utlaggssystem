"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { EDITABLE_STATUSES, MAX_RECEIPTS, OTHER_COMMITTEE, STATUS, type Status } from "@/lib/config";
import { encrypt } from "@/lib/crypto";
import { expenseSchema, flattenIssues, otherCommitteeLabel } from "@/lib/validation";
import { parseISODate, formatNumber } from "@/lib/format";
import { assignNumber } from "@/lib/numbering";
import { mailSubmitted } from "@/lib/email";
import { responsibleEmail } from "@/lib/committees";
import { deleteUpload } from "@/lib/storage";
import type { ActionResult, FormPayload } from "@/lib/expense-types";

async function loadEditable(expenseId: string, userId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { receipts: { include: { files: true }, orderBy: { position: "asc" } } },
  });
  if (!expense || expense.userId !== userId) throw new Error("Utlägget hittades inte");
  if (!EDITABLE_STATUSES.includes(expense.status as Status)) {
    throw new Error("Utlägget är inskickat och kan inte längre ändras");
  }
  return expense;
}

/** Slår upp vald kommitté. Returnerar id + namn, eller "Annan"-text, eller null om ogiltigt val. */
async function resolveCommittee(
  value: string,
  other: string,
): Promise<{ committeeId: string | null; committee: string | null }> {
  if (!value) return { committeeId: null, committee: null };
  if (value === OTHER_COMMITTEE) return { committeeId: null, committee: other.trim() ? otherCommitteeLabel(other) : null };
  const c = await prisma.committee.findUnique({ where: { id: value }, select: { id: true, name: true, active: true } });
  if (!c || !c.active) return { committeeId: null, committee: null };
  return { committeeId: c.id, committee: c.name };
}

/** Skapar ett nytt utkast (med ett tomt kvitto) och går till formuläret. */
export async function createDraft(): Promise<void> {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  const saved = profile?.savedCommittee
    ? await prisma.committee.findFirst({ where: { id: profile.savedCommittee, active: true } })
    : null;
  const expense = await prisma.expense.create({
    data: {
      userId: user.id,
      status: STATUS.UTKAST,
      payeeName: profile?.savedPayeeName ?? user.name,
      payeeEmail: profile?.savedPayeeEmail ?? user.email,
      bankName: profile?.savedBankName ?? null,
      clearing: profile?.savedClearing ?? null,
      accountNumber: profile?.savedAccountNumber ?? null,
      committeeId: saved?.id ?? null,
      committee: saved?.name ?? null,
      receipts: { create: [{ position: 0 }] },
      events: { create: [{ type: "CREATED", actor: user.email }] },
    },
  });
  redirect(`/utlagg/${expense.id}/redigera`);
}

/** Tar bort ett utkast. */
export async function deleteDraft(expenseId: string): Promise<void> {
  const user = await requireUser();
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { receipts: { include: { files: true } } },
  });
  if (!expense || expense.userId !== user.id) return;
  if (expense.status !== STATUS.UTKAST) throw new Error("Bara utkast kan tas bort");
  for (const r of expense.receipts) {
    for (const f of r.files) {
      await deleteUpload(f.storedPath);
      await deleteUpload(f.previewPath);
    }
  }
  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath("/utlagg");
  redirect("/utlagg");
}

/** Tar bort användarens sparade kontouppgifter (förifyllningen). */
export async function forgetSavedDetails(): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { savedBankName: null, savedClearing: null, savedAccountNumber: null, savedSignature: null },
  });
  revalidatePath("/utlagg");
  redirect("/utlagg?glomt=1");
}

/** Lägger till ett tomt kvitto (delbelopp) och returnerar dess id. */
export async function addReceipt(expenseId: string): Promise<{ id: string }> {
  const user = await requireUser();
  const expense = await loadEditable(expenseId, user.id);
  if (expense.receipts.length >= MAX_RECEIPTS) throw new Error(`Max ${MAX_RECEIPTS} kvitton per utlägg`);
  const position = (expense.receipts.at(-1)?.position ?? -1) + 1;
  const receipt = await prisma.receipt.create({ data: { expenseId, position } });
  return { id: receipt.id };
}

/** Tar bort ett kvitto och dess filer. */
export async function removeReceipt(expenseId: string, receiptId: string): Promise<void> {
  const user = await requireUser();
  const expense = await loadEditable(expenseId, user.id);
  const receipt = expense.receipts.find((r) => r.id === receiptId);
  if (!receipt) return;
  for (const f of receipt.files) {
    await deleteUpload(f.storedPath);
    await deleteUpload(f.previewPath);
  }
  await prisma.receipt.delete({ where: { id: receiptId } });
}

function baseData(p: FormPayload) {
  return {
    title: p.title.trim() || null,
    description: p.description.trim() || null,
    payeeName: p.payeeName.trim() || null,
    payeeEmail: p.payeeEmail.trim().toLowerCase() || null,
    bankName: p.bankName.trim() || null,
    clearing: p.clearing.replace(/\D/g, "") || null,
    signatureData: p.signatureData || null,
  };
}

/**
 * Sparar kvittoraderna och returnerar summan samt det senaste kvittodatumet.
 * Utläggets eget datum härleds från kvittona: blanketten har bara ett fält för
 * köpdatum, och då är det sista inköpet det som gäller.
 */
async function saveReceipts(
  expenseId: string,
  receipts: FormPayload["receipts"],
): Promise<{ totalOre: number; latestDate: Date | null }> {
  let totalOre = 0;
  let latestDate: Date | null = null;
  const existing = await prisma.receipt.findMany({ where: { expenseId }, select: { id: true } });
  const ids = new Set(existing.map((r) => r.id));
  let position = 0;
  for (const r of receipts) {
    if (!ids.has(r.id)) continue;
    const amountOre = r.amountOre && r.amountOre > 0 ? Math.round(r.amountOre) : 0;
    totalOre += amountOre;
    const date = parseISODate(r.date.trim());
    if (date && (!latestDate || date > latestDate)) latestDate = date;
    await prisma.receipt.update({
      where: { id: r.id },
      data: {
        amountOre,
        purchaseDate: date,
        note: r.note.trim().slice(0, 120) || null,
        position: position++,
      },
    });
  }
  return { totalOre, latestDate };
}

/** Sparar formuläret som utkast utan att validera. */
export async function saveDraft(expenseId: string, payload: FormPayload): Promise<ActionResult> {
  const user = await requireUser();
  await loadEditable(expenseId, user.id);
  const account = payload.accountNumber.replace(/\D/g, "");
  const { totalOre, latestDate } = await saveReceipts(expenseId, payload.receipts);
  const committee = await resolveCommittee(payload.committee, payload.committeeOther);
  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...baseData(payload),
      ...committee,
      accountNumber: account ? encrypt(account) : null,
      totalOre,
      purchaseDate: latestDate,
    },
  });
  revalidatePath(`/utlagg/${expenseId}`);
  return { ok: true };
}

/** Validerar och skickar in utlägget till kassören. */
export async function submitExpense(expenseId: string, payload: FormPayload): Promise<ActionResult> {
  const user = await requireUser();
  const expense = await loadEditable(expenseId, user.id);

  // Kvittonas filer hämtas från databasen, inte från klienten.
  const receiptsForValidation = payload.receipts
    .filter((r) => expense.receipts.some((x) => x.id === r.id))
    .map((r) => ({
      id: r.id,
      amountOre: r.amountOre ?? Number.NaN,
      date: r.date,
      note: r.note,
      fileIds: expense.receipts.find((x) => x.id === r.id)!.files.map((f) => f.id),
    }));

  const parsed = expenseSchema.safeParse({
    ...payload,
    receipts: receiptsForValidation,
    attest: payload.attest === true ? true : undefined,
  });
  const errors = parsed.success ? {} : flattenIssues(parsed.error.issues);

  const committee = parsed.success ? await resolveCommittee(parsed.data.committee, parsed.data.committeeOther) : null;
  if (parsed.success && !committee?.committee) {
    errors.committee = "Välj en kommitté i listan";
  }

  if (!parsed.success || Object.keys(errors).length > 0) {
    // Spara ändå som utkast så att inget går förlorat.
    await saveDraft(expenseId, payload);
    return {
      ok: false,
      errors,
      message: "Några uppgifter saknas eller är felaktiga. Se markeringarna nedan.",
    };
  }
  const v = parsed.data;
  const resubmitted = expense.status === STATUS.KOMPLETTERING;
  const now = new Date();

  const { totalOre, latestDate } = await saveReceipts(
    expenseId,
    v.receipts.map((r) => ({ id: r.id, amountOre: r.amountOre, date: r.date, note: r.note })),
  );
  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...baseData(payload),
      ...committee,
      title: v.title,
      description: v.description,
      payeeName: v.payeeName,
      payeeEmail: v.payeeEmail,
      bankName: v.bankName,
      clearing: v.clearing,
      accountNumber: encrypt(v.accountNumber),
      totalOre,
      purchaseDate: latestDate,
      signatureData: v.signatureData,
      signedAt: now,
      status: STATUS.INSKICKAD,
      submittedAt: now,
      adminMessage: null,
      reminderSentAt: null,
      events: {
        create: [{ type: resubmitted ? "RESUBMITTED" : "SUBMITTED", actor: user.email }],
      },
    },
  });
  const { year, number } = await assignNumber(expenseId);

  // Kom ihåg uppgifterna till nästa gång.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      savedPayeeName: v.payeeName,
      savedPayeeEmail: v.payeeEmail,
      savedBankName: v.bankName,
      savedClearing: v.clearing,
      savedAccountNumber: encrypt(v.accountNumber),
      savedCommittee: committee!.committeeId,
      savedSignature: v.signatureData,
    },
  });

  try {
    const notifyTo = await responsibleEmail(committee!.committeeId);
    await mailSubmitted(
      {
        id: expenseId,
        title: v.title,
        payeeName: v.payeeName,
        payeeEmail: v.payeeEmail,
        totalOre,
        numberLabel: formatNumber(year, number),
        committee: committee!.committee,
      },
      resubmitted,
      { email: notifyTo, committee: committee!.committee },
    );
  } catch (e) {
    console.error("Kunde inte skicka mail:", e);
  }

  revalidatePath("/utlagg");
  revalidatePath("/admin");
  redirect(`/utlagg/${expenseId}?skickat=1`);
}
