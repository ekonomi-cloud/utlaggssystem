"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveExpense,
  markPaid,
  regeneratePdf,
  rejectExpense,
  requestComplement,
  type AdminResult,
} from "@/app/admin/actions";

type Props = {
  expenseId: string;
  status: string;
  hasTreasurerSignature: boolean;
  driveUrl: string | null;
  hasPdf: boolean;
};

export function AdminActions({ expenseId, status, hasTreasurerSignature, driveUrl, hasPdf }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [complement, setComplement] = useState("");
  const [reject, setReject] = useState("");
  const [mode, setMode] = useState<"none" | "complement" | "reject">("none");

  const run = (fn: () => Promise<AdminResult>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setResult(null);
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setMode("none");
        router.refresh();
      }
    });
  };

  return (
    <div className="card accent">
      <h2>Åtgärder</h2>
      {result && (
        <div className={`alert ${result.ok ? "success" : "error"}`}>
          <p>{result.message}</p>
          {result.warnings?.map((w, i) => (
            <p key={i} className="small">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {status === "INSKICKAD" && (
        <>
          {!hasTreasurerSignature && (
            <div className="alert warn">
              <p>
                Du behöver lägga in namn och signatur under <Link href="/admin/installningar">Inställningar</Link> innan
                du kan godkänna.
              </p>
            </div>
          )}
          <div className="btn-row">
            <button
              className="btn success"
              disabled={busy || !hasTreasurerSignature}
              onClick={() =>
                run(
                  () => approveExpense(expenseId),
                  "Godkänn utlägget? Blanketten genereras med din signatur, sparas i Drive och utläggaren får mail.",
                )
              }
            >
              ✓ Godkänn
            </button>
            <button className="btn warn" disabled={busy} onClick={() => setMode(mode === "complement" ? "none" : "complement")}>
              Begär komplettering
            </button>
            <button className="btn danger" disabled={busy} onClick={() => setMode(mode === "reject" ? "none" : "reject")}>
              Neka
            </button>
          </div>
        </>
      )}

      {status === "KOMPLETTERING" && (
        <>
          <p className="muted">Utlägget väntar på att utläggaren kompletterar. Du kan också neka det direkt.</p>
          <button className="btn danger" disabled={busy} onClick={() => setMode(mode === "reject" ? "none" : "reject")}>
            Neka
          </button>
        </>
      )}

      {mode === "complement" && (
        <div style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="complement">Vad behöver kompletteras?</label>
            <p className="help">Skickas med mail till utläggaren, som sedan kan ändra och skicka in igen.</p>
            <textarea
              id="complement"
              className="textarea"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="T.ex. Kvittot är för suddigt för att läsa beloppet, fota om det i bättre ljus."
            />
          </div>
          <button className="btn warn" disabled={busy || complement.trim().length < 5} onClick={() => run(() => requestComplement(expenseId, complement))}>
            Skicka tillbaka för komplettering
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="reject">Motivering</label>
            <p className="help">Skickas med mail till utläggaren. Ett nekat utlägg kan inte återöppnas.</p>
            <textarea id="reject" className="textarea" value={reject} onChange={(e) => setReject(e.target.value)} />
          </div>
          <button
            className="btn danger"
            disabled={busy || reject.trim().length < 5}
            onClick={() => run(() => rejectExpense(expenseId, reject), "Neka utlägget? Det går inte att ångra.")}
          >
            Neka utlägget
          </button>
        </div>
      )}

      {status === "GODKAND" && (
        <>
          <p className="muted">
            Utlägget är godkänt. När du har fört över pengarna, markera det som utbetalt så får utläggaren mail
            och blanketten uppdateras med utbetalningsdatum.
          </p>
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => run(() => markPaid(expenseId), "Har du fört över pengarna? Utläggaren får mail om att utlägget är utbetalt.")}
            >
              Markera som utbetald
            </button>
          </div>
        </>
      )}

      {(status === "GODKAND" || status === "UTBETALD") && (
        <div className="btn-row" style={{ marginTop: "1rem" }}>
          {hasPdf && (
            <a className="btn small" href={`/api/expenses/${expenseId}/pdf`} target="_blank" rel="noreferrer">
              Öppna PDF
            </a>
          )}
          {driveUrl && (
            <a className="btn small" href={driveUrl} target="_blank" rel="noreferrer">
              Öppna i Google Drive
            </a>
          )}
          <button className="btn small ghost" disabled={busy} onClick={() => run(() => regeneratePdf(expenseId))}>
            Generera PDF igen
          </button>
        </div>
      )}

      {status === "NEKAD" && <p className="muted">Utlägget är nekat.</p>}
      {busy && <p className="small muted" style={{ marginTop: "0.75rem" }}>Arbetar…</p>}
    </div>
  );
}
