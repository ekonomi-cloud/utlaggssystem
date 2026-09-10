"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManage, requireAdmin, requireTreasurer, type SessionUser } from "@/lib/dal";
import { STATUS } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { generateExpensePdf, pdfFilename, type Treasurer } from "@/lib/pdf";
import { savePdf } from "@/lib/storage";
import { driveConfigured, uploadPdf, checkFolder } from "@/lib/drive";
import { driveFolderFor, importDefaultCommittees, responsibleEmail } from "@/lib/committees";
import { mailComplementRequested, mailPaid, mailRejected, sendMail, adminMail, type Contact } from "@/lib/email";
import { runDailyJobs } from "@/lib/jobs";
import type { ExpenseWithAll } from "@/components/ExpenseDetails";

export type AdminResult = { ok: boolean; message: string; warnings?: string[] };

const includeAll = {
  receipts: { include: { files: true }, orderBy: { position: "asc" as const } },
  events: true,
  user: true,
};

async function load(id: string): Promise<ExpenseWithAll> {
  const e = await prisma.expense.findUnique({ where: { id }, include: includeAll });
  if (!e) throw new Error("Utlägget hittades inte");
  return e;
}

/** Laddar utlägget och kontrollerar att användaren får hantera det. */
async function loadManageable(id: string, user: SessionUser): Promise<ExpenseWithAll> {
  const e = await load(id);
  if (!canManage(user, e)) throw new Error("Du har inte behörighet att hantera det här utlägget");
  return e;
}

/** Namn och signatur för den kassör som ska stå på blanketten. */
export async function treasurerFor(email: string | null | undefined): Promise<Treasurer> {
  if (!email) return { name: "", signatureData: null };
  const p = await prisma.treasurerProfile.findUnique({ where: { email: email.toLowerCase() } });
  return { name: p?.name ?? "", signatureData: p?.signatureData ?? null };
}

function info(e: ExpenseWithAll) {
  return {
    id: e.id,
    title: e.title ?? "",
    payeeName: e.payeeName ?? "",
    payeeEmail: e.payeeEmail ?? "",
    totalOre: e.totalOre,
    numberLabel: formatNumber(e.year, e.number),
    committee: e.committee,
  };
}

/** Kassören som äger utlägget: skrivs ut i mailet och blir svarsadress. */
async function contactFor(e: ExpenseWithAll): Promise<Contact> {
  return { email: await responsibleEmail(e.committeeId), committee: e.committee };
}

async function event(expenseId: string, type: string, actor: string, message?: string) {
  await prisma.expenseEvent.create({ data: { expenseId, type, actor, message } });
}

/** Genererar PDF, sparar lokalt och laddar upp till Drive. Returnerar varningar. */
async function buildAndStorePdf(id: string, actor: string): Promise<{ pdf: Buffer; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const e = await load(id);
  const t = await treasurerFor(e.approvedBy ?? actor);
  const bytes = await generateExpensePdf(e, t);
  const filename = pdfFilename(e);
  const rel = `${e.year ?? "okant"}/${e.id}.pdf`;
  await savePdf(rel, bytes);
  await prisma.expense.update({ where: { id }, data: { pdfPath: rel } });
  await event(id, "PDF_GENERATED", actor, filename);

  if (driveConfigured()) {
    try {
      const folder = await driveFolderFor(e.committeeId);
      const f = await uploadPdf(filename, bytes, e.driveFileId, folder);
      await prisma.expense.update({ where: { id }, data: { driveFileId: f.id, driveUrl: f.url } });
      await event(id, "DRIVE_UPLOADED", actor, f.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Kunde inte spara i Google Drive: ${msg}`);
      await event(id, "DRIVE_FAILED", actor, msg);
    }
  } else {
    warnings.push("Google Drive är inte konfigurerat. PDF:en är sparad lokalt på servern.");
  }
  return { pdf: Buffer.from(bytes), filename, warnings };
}

export async function approveExpense(id: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const e = await loadManageable(id, user);
  if (e.status !== STATUS.INSKICKAD) return { ok: false, message: "Bara inskickade utlägg kan godkännas." };
  const t = await treasurerFor(user.email);
  if (!t.name || !t.signatureData) {
    return { ok: false, message: "Lägg in ditt namn och din signatur under Inställningar innan du godkänner." };
  }
  await prisma.expense.update({
    where: { id },
    data: { status: STATUS.GODKAND, approvedAt: new Date(), approvedBy: user.email, adminMessage: null, reminderSentAt: null },
  });
  await event(id, "APPROVED", user.email);

  // Inget mail vid godkännande: blanketten är inte komplett förrän utbetalningsdatumet
  // finns i den, och utläggaren får ändå besked när pengarna skickats.
  const { warnings } = await buildAndStorePdf(id, user.email);
  revalidatePath("/admin");
  revalidatePath(`/admin/${id}`);
  return { ok: true, message: "Utlägget är godkänt och blanketten genererad. Utläggaren får mail när du markerat det som utbetalt.", warnings };
}

export async function markPaid(id: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const e = await loadManageable(id, user);
  if (e.status !== STATUS.GODKAND) return { ok: false, message: "Bara godkända utlägg kan markeras som utbetalda." };
  await prisma.expense.update({
    where: { id },
    data: { status: STATUS.UTBETALD, paidAt: new Date(), paidBy: user.email },
  });
  await event(id, "PAID", user.email);
  // Blanketten görs om med utbetalningsdatum och ersätter filen i Drive.
  const { pdf, filename, warnings } = await buildAndStorePdf(id, user.email);
  try {
    const done = await load(id);
    await mailPaid(info(done), await contactFor(done), { filename, content: pdf });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Mail till utläggaren kunde inte skickas: ${msg}`);
    await event(id, "MAIL_FAILED", user.email, msg);
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/${id}`);
  return { ok: true, message: "Utlägget är markerat som utbetalt.", warnings };
}

export async function requestComplement(id: string, message: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const e = await loadManageable(id, user);
  const msg = message.trim();
  if (e.status !== STATUS.INSKICKAD) return { ok: false, message: "Bara inskickade utlägg kan skickas tillbaka." };
  if (msg.length < 5) return { ok: false, message: "Skriv vad som behöver kompletteras." };
  await prisma.expense.update({ where: { id }, data: { status: STATUS.KOMPLETTERING, adminMessage: msg } });
  await event(id, "COMPLEMENT_REQUESTED", user.email, msg);
  const warnings: string[] = [];
  try {
    await mailComplementRequested(info(e), msg, await contactFor(e));
  } catch (err) {
    warnings.push(`Mail kunde inte skickas: ${err instanceof Error ? err.message : String(err)}`);
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/${id}`);
  return { ok: true, message: "Utlägget är skickat tillbaka för komplettering.", warnings };
}

export async function rejectExpense(id: string, message: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const e = await loadManageable(id, user);
  const msg = message.trim();
  if (e.status !== STATUS.INSKICKAD && e.status !== STATUS.KOMPLETTERING) {
    return { ok: false, message: "Utlägget kan inte nekas i nuvarande status." };
  }
  if (msg.length < 5) return { ok: false, message: "Skriv en motivering till utläggaren." };
  await prisma.expense.update({
    where: { id },
    data: { status: STATUS.NEKAD, rejectedAt: new Date(), adminMessage: msg },
  });
  await event(id, "REJECTED", user.email, msg);
  const warnings: string[] = [];
  try {
    await mailRejected(info(e), msg, await contactFor(e));
  } catch (err) {
    warnings.push(`Mail kunde inte skickas: ${err instanceof Error ? err.message : String(err)}`);
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/${id}`);
  return { ok: true, message: "Utlägget är nekat.", warnings };
}

/** Gör om PDF:en och försöker ladda upp till Drive igen. */
export async function regeneratePdf(id: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const e = await loadManageable(id, user);
  if (e.status !== STATUS.GODKAND && e.status !== STATUS.UTBETALD) {
    return { ok: false, message: "Blanketten genereras först när utlägget är godkänt." };
  }
  const { warnings } = await buildAndStorePdf(id, user.email);
  revalidatePath(`/admin/${id}`);
  return { ok: true, message: "Blanketten är genererad på nytt.", warnings };
}

/** Sparar den inloggade kassörens namn och signatur. */
export async function saveProfile(name: string, signature: string): Promise<AdminResult> {
  const user = await requireTreasurer();
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, message: "Ange ditt namn." };
  if (!signature.startsWith("data:image/png;base64,")) {
    return { ok: false, message: "Signera i rutan (eller behåll din befintliga signatur)." };
  }
  await prisma.treasurerProfile.upsert({
    where: { email: user.email },
    update: { name: trimmed, signatureData: signature },
    create: { email: user.email, name: trimmed, signatureData: signature },
  });
  revalidatePath("/admin/installningar");
  return { ok: true, message: "Namn och signatur är sparade." };
}

// ---------- Kommittéer (bara sektionskassören) ----------

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Skapar eller uppdaterar en kommitté från formuläret på /admin/kommitteer. */
export async function saveCommittee(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (name.length < 2) redirect("/admin/kommitteer?fel=namn");
  const email = str(formData, "treasurerEmail").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/admin/kommitteer?fel=epost");
  const data = {
    name,
    treasurerEmail: email || null,
    treasurerName: str(formData, "treasurerName") || null,
    driveFolderId: str(formData, "driveFolderId") || null,
    sortOrder: Number(str(formData, "sortOrder")) || 0,
    active: formData.get("active") === "on",
  };
  const clash = await prisma.committee.findUnique({ where: { name } });
  if (clash && clash.id !== id) redirect("/admin/kommitteer?fel=dubblett");
  if (id) {
    await prisma.committee.update({ where: { id }, data });
  } else {
    await prisma.committee.create({ data });
  }
  revalidatePath("/admin/kommitteer");
  redirect("/admin/kommitteer?sparat=1");
}

/** Lägger in standardlistan över kommittéer (bara de som saknas). */
export async function importCommittees(): Promise<void> {
  await requireAdmin();
  await importDefaultCommittees();
  revalidatePath("/admin/kommitteer");
  redirect("/admin/kommitteer?importerat=1");
}

export async function deleteCommittee(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  const used = await prisma.expense.count({ where: { committeeId: id } });
  if (used > 0) redirect("/admin/kommitteer?fel=anvands");
  await prisma.committee.delete({ where: { id } });
  revalidatePath("/admin/kommitteer");
  redirect("/admin/kommitteer?borttagen=1");
}

// ---------- Verktyg ----------

export async function runJobsNow(): Promise<AdminResult> {
  await requireAdmin();
  try {
    const r = await runDailyJobs();
    revalidatePath("/admin/installningar");
    return {
      ok: true,
      message: `Jobben kördes: ${r.remindersSent} påminnelsemail, ${r.accountsCleared} gallrade kontonummer, ${r.draftsDeleted} borttagna utkast.`,
    };
  } catch (err) {
    return { ok: false, message: `Jobben misslyckades: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function testDrive(): Promise<AdminResult> {
  await requireAdmin();
  if (!driveConfigured()) return { ok: false, message: "Google Drive är inte konfigurerat i .env." };
  try {
    const name = await checkFolder();
    return { ok: true, message: `Kopplingen fungerar. Mappen heter ”${name}”.` };
  } catch (err) {
    return { ok: false, message: `Kunde inte nå mappen: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function testMail(): Promise<AdminResult> {
  const user = await requireAdmin();
  try {
    await sendMail({
      to: adminMail(),
      subject: "Testmail från utläggssystemet",
      text: `Hej!\n\nDet här är ett testmail skickat av ${user.email} från utläggssystemet. Fungerar det så fungerar utskicken till utläggarna också.`,
    });
    return { ok: true, message: `Testmail skickat till ${adminMail()}.` };
  } catch (err) {
    return { ok: false, message: `Kunde inte skicka: ${err instanceof Error ? err.message : String(err)}` };
  }
}
