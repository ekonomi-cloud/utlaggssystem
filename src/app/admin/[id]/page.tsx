import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManage, requireTreasurer } from "@/lib/dal";
import { STATUS_DESCRIPTION, type Status } from "@/lib/config";
import { StatusBadge } from "@/components/StatusBadge";
import { ExpenseDetails } from "@/components/ExpenseDetails";
import { AdminActions } from "@/components/AdminActions";
import { formatNumber } from "@/lib/format";
import { treasurerFor } from "../actions";

export const metadata = { title: "Granska utlägg" };

export default async function AdminExpensePage({ params }: PageProps<"/admin/[id]">) {
  const user = await requireTreasurer();
  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      receipts: { include: { files: true }, orderBy: { position: "asc" } },
      events: true,
      user: true,
      committeeRef: true,
    },
  });
  if (!expense) notFound();

  if (!canManage(user, expense)) {
    return (
      <main className="container narrow">
        <div className="alert warn">
          <p>
            Det här utlägget gäller {expense.committee ?? "en annan förening"} och hanteras av en annan kassör.
          </p>
        </div>
        <Link href="/admin" className="btn small">
          ← Kassörsvyn
        </Link>
      </main>
    );
  }

  const [profile, previousCount] = await Promise.all([
    treasurerFor(user.email),
    prisma.expense.count({
      where: { userId: expense.userId, status: { in: ["GODKAND", "UTBETALD"] }, id: { not: id } },
    }),
  ]);

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>
            <span className="mono muted" style={{ fontWeight: 400 }}>
              {formatNumber(expense.year, expense.number)}
            </span>{" "}
            {expense.title}
          </h1>
          <StatusBadge status={expense.status} />{" "}
          <span className="muted small">{STATUS_DESCRIPTION[expense.status as Status]}</span>
        </div>
        <Link href="/admin" className="btn small">
          ← Alla utlägg
        </Link>
      </div>

      <div className="grid-2">
        <div>
          <ExpenseDetails expense={expense} showFullAccount />
        </div>
        <div>
          <AdminActions
            expenseId={id}
            status={expense.status}
            hasTreasurerSignature={Boolean(profile.name && profile.signatureData)}
            driveUrl={expense.driveUrl}
            hasPdf={Boolean(expense.pdfPath)}
          />
          <div className="card">
            <h3>Om utläggaren</h3>
            <dl className="dl">
              <dt>Konto</dt>
              <dd>{expense.user.email}</dd>
              <dt>Tidigare godkända</dt>
              <dd>{previousCount} st</dd>
              <dt>Hanteras av</dt>
              <dd>
                {expense.committeeRef?.treasurerEmail
                  ? `${expense.committeeRef.treasurerName ?? ""} (${expense.committeeRef.treasurerEmail})`.trim()
                  : "Sektionskassören"}
              </dd>
            </dl>
          </div>
          {expense.status === "INSKICKAD" && (
            <div className="card">
              <h3>Förhandsgranska blanketten</h3>
              <p className="small muted">Så här kommer PDF:en att se ut (utan din signatur tills du godkänner).</p>
              <a className="btn small" href={`/api/expenses/${id}/pdf?forhandsgranska=1`} target="_blank" rel="noreferrer">
                Öppna förhandsgranskning
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
