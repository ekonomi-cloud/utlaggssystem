import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { STATUS_DESCRIPTION, type Status } from "@/lib/config";
import { StatusBadge } from "@/components/StatusBadge";
import { ExpenseDetails } from "@/components/ExpenseDetails";

export const metadata = { title: "Utlägg" };

export default async function ExpensePage({ params, searchParams }: PageProps<"/utlagg/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      receipts: { include: { files: true }, orderBy: { position: "asc" } },
      events: true,
      user: true,
    },
  });
  if (!expense || expense.userId !== user.id) notFound();
  if (expense.status === "UTKAST") redirect(`/utlagg/${id}/redigera`);

  return (
    <main className="container narrow">
      {sp.skickat === "1" && (
        <div className="alert success">
          <p>
            <strong>Tack! Ditt utlägg är inskickat.</strong> Du får ett mail när kassören har godkänt det, och ett
            till när pengarna är utbetalda.
          </p>
        </div>
      )}
      <div className="page-head">
        <div>
          <h1>{expense.title}</h1>
          <StatusBadge status={expense.status} />{" "}
          <span className="muted small">{STATUS_DESCRIPTION[expense.status as Status]}</span>
        </div>
        <Link href="/utlagg" className="btn small">
          ← Mina utlägg
        </Link>
      </div>

      {expense.status === "KOMPLETTERING" && (
        <div className="alert warn">
          <p>
            <strong>Kassören behöver mer information:</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{expense.adminMessage}</p>
          <Link href={`/utlagg/${id}/redigera`} className="btn warn">
            Komplettera och skicka in igen
          </Link>
        </div>
      )}
      {expense.status === "NEKAD" && expense.adminMessage && (
        <div className="alert error">
          <p>
            <strong>Motivering från kassören:</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{expense.adminMessage}</p>
        </div>
      )}
      {expense.pdfPath && (expense.status === "GODKAND" || expense.status === "UTBETALD") && (
        <div className="alert success">
          <p>
            Den ifyllda och attesterade blanketten:{" "}
            <a href={`/api/expenses/${id}/pdf`} target="_blank" rel="noreferrer">
              Öppna PDF
            </a>
          </p>
        </div>
      )}

      <ExpenseDetails expense={expense} showFullAccount={false} />
    </main>
  );
}
