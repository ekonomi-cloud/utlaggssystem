"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/SignaturePad";
import { runJobsNow, saveProfile, testDrive, testMail, type AdminResult } from "@/app/admin/actions";

type Props = {
  email: string;
  initialName: string;
  initialSignature: string | null;
  isAdmin: boolean;
  driveConfigured: boolean;
  mailLabel: string;
  mailWorks: boolean;
  jobsLastRun: string | null;
  jobInfo: { reminderDays: number; accountDays: number; draftDays: number };
};

export function SettingsForm({ email, initialName, initialSignature, isAdmin, driveConfigured, mailLabel, mailWorks, jobsLastRun, jobInfo }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [signature, setSignature] = useState("");
  const [replace, setReplace] = useState(!initialSignature);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [toolResult, setToolResult] = useState<AdminResult | null>(null);
  const [busy, start] = useTransition();

  const onSave = () => {
    start(async () => {
      const sig = replace ? signature : (initialSignature ?? "");
      const r = await saveProfile(name, sig);
      setResult(r);
      if (r.ok) {
        setReplace(false);
        router.refresh();
      }
    });
  };

  const tool = (fn: () => Promise<AdminResult>) => start(async () => setToolResult(await fn()));

  return (
    <>
      <div className="card accent">
        <h2>Ditt namn och din signatur</h2>
        <p className="muted">
          Hamnar i rutan ”Fylls i av kassören” på varje blankett du godkänner. Inloggad som {email}.
        </p>
        {result && (
          <div className={`alert ${result.ok ? "success" : "error"}`}>
            <p>{result.message}</p>
          </div>
        )}
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="name">Namn</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Förnamn Efternamn" />
        </div>
        <div className="field">
          <span className="label">Signatur</span>
          {initialSignature && !replace ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="signature-img" src={initialSignature} alt="Nuvarande signatur" />
              <div style={{ marginTop: "0.5rem" }}>
                <button type="button" className="btn small" onClick={() => setReplace(true)}>
                  Byt signatur
                </button>
              </div>
            </div>
          ) : (
            <>
              <SignaturePad value={signature} onChange={setSignature} />
              <p className="help">Rita din namnteckning. På mobil eller surfplatta blir det oftast snyggast.</p>
              {initialSignature && (
                <button type="button" className="btn small ghost" style={{ marginTop: "0.5rem" }} onClick={() => setReplace(false)}>
                  Avbryt, behåll nuvarande
                </button>
              )}
            </>
          )}
        </div>
        <button className="btn primary" disabled={busy} onClick={onSave}>
          Spara
        </button>
      </div>

      {isAdmin && (
        <>
          <div className="card">
            <h2>Kommittéer och kassörer</h2>
            <p className="muted">
              Vilka kommittéer som går att välja i formuläret och vilken kassör som hanterar respektive kommittés
              utlägg.
            </p>
            <Link href="/admin/kommitteer" className="btn">
              Hantera kommittéer
            </Link>
          </div>

          <div className="card">
            <h2>Kopplingar och automatik</h2>
            {toolResult && (
              <div className={`alert ${toolResult.ok ? "success" : "error"}`}>
                <p>{toolResult.message}</p>
              </div>
            )}
            <dl className="dl">
              <dt>Google Drive</dt>
              <dd>
                {driveConfigured ? "Konfigurerad" : "Inte konfigurerad (PDF:er sparas bara lokalt på servern)"}{" "}
                <button className="btn small" disabled={busy || !driveConfigured} onClick={() => tool(testDrive)}>
                  Testa
                </button>
              </dd>
              <dt>E-post</dt>
              <dd>
                {mailLabel}{" "}
                <button className="btn small" disabled={busy || !mailWorks} onClick={() => tool(testMail)}>
                  Skicka testmail
                </button>
              </dd>
              <dt>Dagliga jobb</dt>
              <dd>
                Senast körda: {jobsLastRun ?? "aldrig"}{" "}
                <button className="btn small" disabled={busy} onClick={() => tool(runJobsNow)}>
                  Kör nu
                </button>
                <p className="small muted" style={{ margin: "0.4rem 0 0" }}>
                  Körs automatiskt en gång per dygn: påminnelse till kassören om utlägg som väntat {jobInfo.reminderDays}{" "}
                  dagar, gallring av kontonummer {jobInfo.accountDays} dagar efter utbetalning, och borttagning av
                  utkast som inte rörts på {jobInfo.draftDays} dagar.
                </p>
              </dd>
            </dl>
            <p className="small muted" style={{ marginTop: "1rem" }}>
              Kopplingar och tidsgränser ställs in i filen .env på servern. Se README för instruktioner.
            </p>
          </div>
        </>
      )}
    </>
  );
}
