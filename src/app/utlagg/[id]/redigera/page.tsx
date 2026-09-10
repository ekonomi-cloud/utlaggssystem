import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { EDITABLE_STATUSES, OTHER_COMMITTEE, OTHER_PREFIX, type Status } from "@/lib/config";
import { decrypt } from "@/lib/crypto";
import { formatDay, oreToInput } from "@/lib/format";
import { activeCommittees } from "@/lib/committees";
import type { FormState } from "@/lib/expense-types";
import { ExpenseForm } from "@/components/ExpenseForm";
import { deleteDraft } from "../../actions";

export const metadata = { title: "Fyll i utlägg" };

export default async function EditExpensePage({ params }: PageProps<"/utlagg/[id]/redigera">) {
  const user = await requireUser();
  const { id } = await params;
  const [expense, committees, profile] = await Promise.all([
    prisma.expense.findUnique({
      where: { id },
      include: { receipts: { include: { files: true }, orderBy: { position: "asc" } } },
    }),
    activeCommittees(),
    prisma.user.findUnique({ where: { id: user.id }, select: { savedSignature: true } }),
  ]);
  if (!expense || expense.userId !== user.id) notFound();
  if (!EDITABLE_STATUSES.includes(expense.status as Status)) redirect(`/utlagg/${id}`);

  let committee = "";
  let committeeOther = "";
  if (expense.committeeId && committees.some((c) => c.id === expense.committeeId)) {
    committee = expense.committeeId;
  } else if (expense.committee?.startsWith(OTHER_PREFIX)) {
    committee = OTHER_COMMITTEE;
    committeeOther = expense.committee.slice(OTHER_PREFIX.length);
  }

  const initial: FormState = {
    committee,
    committeeOther,
    title: expense.title ?? "",
    description: expense.description ?? "",
    payeeName: expense.payeeName ?? user.name,
    payeeEmail: expense.payeeEmail ?? user.email,
    clearing: expense.clearing ?? "",
    bankName: expense.bankName ?? "",
    accountNumber: decrypt(expense.accountNumber),
    receipts: expense.receipts.map((r) => ({
      id: r.id,
      amount: oreToInput(r.amountOre),
      date: formatDay(r.purchaseDate),
      note: r.note ?? "",
      files: r.files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        pageCount: f.pageCount,
        previewUrl: f.previewPath ? `/api/files/${f.id}?v=preview` : null,
      })),
    })),
    // Vid komplettering ska utläggaren signera på nytt.
    signatureData: expense.status === "KOMPLETTERING" ? "" : (expense.signatureData ?? ""),
    attest: false,
  };

  return (
    <main className="container narrow">
      <div className="page-head">
        <div>
          <h1>{expense.status === "KOMPLETTERING" ? "Komplettera utlägg" : "Fyll i utlägg"}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Fyll i alla fält. Fält som saknas eller är fel markeras när du försöker skicka in.
          </p>
        </div>
        {expense.status === "UTKAST" && (
          <form action={deleteDraft.bind(null, id)}>
            <button className="btn small ghost" type="submit">
              Ta bort utkast
            </button>
          </form>
        )}
      </div>
      <ol className="steps">
        <li className="current">Vad gäller utlägget</li>
        <li className="current">Kvitton och belopp</li>
        <li className="current">Konto</li>
        <li className="current">Attest</li>
      </ol>
      <ExpenseForm
        expenseId={id}
        initial={initial}
        status={expense.status}
        adminMessage={expense.adminMessage}
        committees={committees}
        savedSignature={profile?.savedSignature ?? null}
      />
    </main>
  );
}
