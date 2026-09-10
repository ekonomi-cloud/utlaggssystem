import type { Prisma } from "@prisma/client";
import { formatDate, formatDateTime, formatDay, formatNumber, formatSek } from "@/lib/format";
import { decrypt, maskAccount } from "@/lib/crypto";

export type ExpenseWithAll = Prisma.ExpenseGetPayload<{
  include: {
    receipts: { include: { files: true } };
    events: true;
    user: true;
  };
}>;

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Utkast skapat",
  SUBMITTED: "Inskickat",
  RESUBMITTED: "Inskickat igen efter komplettering",
  COMPLEMENT_REQUESTED: "Komplettering begärd",
  APPROVED: "Godkänt",
  REJECTED: "Nekat",
  PAID: "Utbetalt",
  PDF_GENERATED: "Blankett genererad",
  DRIVE_UPLOADED: "Sparad i Google Drive",
  DRIVE_FAILED: "Kunde inte spara i Google Drive",
  MAIL_FAILED: "Mail kunde inte skickas",
  ACCOUNT_DELETED: "Kontonummer gallrat",
};

/** Köpdatum: en dag, eller spannet när kvittona kommer från olika dagar. */
function receiptDateLabel(expense: ExpenseWithAll): string {
  const dates = [...new Set(expense.receipts.map((r) => formatDay(r.purchaseDate)).filter(Boolean))].sort();
  if (dates.length > 1) return `${dates[0]} – ${dates[dates.length - 1]} (${dates.length} datum)`;
  return dates[0] ?? formatDay(expense.purchaseDate);
}

/** Visar ett utläggs uppgifter, kvitton, signatur och händelselogg. */
export function ExpenseDetails({ expense, showFullAccount }: { expense: ExpenseWithAll; showFullAccount: boolean }) {
  const account = decrypt(expense.accountNumber);
  return (
    <>
      <div className="card">
        <h2>Uppgifter</h2>
        <dl className="dl">
          <dt>Nummer</dt>
          <dd className="mono">{formatNumber(expense.year, expense.number)}</dd>
          <dt>Kommitté/förening</dt>
          <dd>{expense.committee ?? "–"}</dd>
          <dt>Titel för arrangemang</dt>
          <dd>
            <strong>{expense.title ?? "–"}</strong>
          </dd>
          <dt>Beskrivning</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{expense.description ?? "–"}</dd>
          <dt>Datum vid köp</dt>
          <dd className="mono">{receiptDateLabel(expense) || "–"}</dd>
          <dt>Summa</dt>
          <dd>
            <strong>{formatSek(expense.totalOre)}</strong>
          </dd>
          <dt>Namn</dt>
          <dd>{expense.payeeName ?? "–"}</dd>
          <dt>E-post</dt>
          <dd>{expense.payeeEmail ?? "–"}</dd>
          <dt>Bank</dt>
          <dd>{expense.bankName ?? "–"}</dd>
          <dt>Clearingnr</dt>
          <dd className="mono">{expense.clearing ?? "–"}</dd>
          <dt>Kontonr</dt>
          <dd className="mono">
            {account
              ? showFullAccount
                ? account
                : maskAccount(account)
              : expense.accountDeletedAt
                ? <span className="muted">Gallrat {formatDate(expense.accountDeletedAt)}</span>
                : "–"}
          </dd>
          <dt>Inskickat</dt>
          <dd className="mono">{formatDateTime(expense.submittedAt) || "–"}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Kvitton</h2>
        {expense.receipts.map((r, i) => (
          <div className="receipt-view" key={r.id}>
            <h3>
              Kvitto {i + 1}: {formatSek(r.amountOre)}
              {r.purchaseDate ? (
                <span className="mono muted" style={{ fontWeight: 400 }}> · {formatDay(r.purchaseDate)}</span>
              ) : null}
              {r.note ? <span className="muted" style={{ fontWeight: 400 }}> · {r.note}</span> : null}
            </h3>
            {r.files.length === 0 && <p className="muted small">Ingen fil uppladdad.</p>}
            <div className="thumbs">
              {r.files.map((f) => (
                <a
                  key={f.id}
                  className="thumb"
                  href={`/api/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${f.originalName} (${Math.round(f.size / 1024)} kB)`}
                  style={{ width: 160 }}
                >
                  {f.previewPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${f.id}?v=preview`} alt={f.originalName} style={{ height: 160 }} />
                  ) : (
                    <div className="pdf" style={{ height: 160 }}>
                      PDF{f.pageCount ? ` · ${f.pageCount} s` : ""}
                    </div>
                  )}
                  <div className="name">{f.originalName}</div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Attest</h2>
        {expense.signatureData ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="signature-img" src={expense.signatureData} alt="Signatur" />
            <p className="small muted" style={{ margin: "0.4rem 0 0" }}>
              {expense.payeeName}, signerat {formatDateTime(expense.signedAt)}
            </p>
          </>
        ) : (
          <p className="muted">Inte signerat.</p>
        )}
      </div>

      <div className="card">
        <h2>Händelser</h2>
        <ul className="timeline">
          {expense.events
            .slice()
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((ev) => (
              <li key={ev.id}>
                <span className="when">{formatDateTime(ev.createdAt)}</span>
                <span>
                  <strong>{EVENT_LABEL[ev.type] ?? ev.type}</strong>
                  {ev.actor ? <span className="muted small"> · {ev.actor}</span> : null}
                  {ev.message ? <div className="msg">{ev.message}</div> : null}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
