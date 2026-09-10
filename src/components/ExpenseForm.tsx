"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FormFile, FormPayload, FormReceipt, FormState } from "@/lib/expense-types";
import { ATTEST_TEXT, MAX_RECEIPTS, OTHER_COMMITTEE } from "@/lib/config";
import { lookupClearing } from "@/lib/banks";
import { formatDate, formatSek, parseAmountToOre, todayISO } from "@/lib/format";
import { dateError, expenseSchema, flattenIssues } from "@/lib/validation";
import { addReceipt, removeReceipt, saveDraft, submitExpense } from "@/app/utlagg/actions";
import { ReceiptUploader } from "@/components/ReceiptUploader";
import { SignaturePad } from "@/components/SignaturePad";

type Props = {
  expenseId: string;
  initial: FormState;
  status: string;
  adminMessage: string | null;
  committees: { id: string; name: string }[];
  /** Signaturen från utläggarens förra utlägg, som kan återanvändas. */
  savedSignature: string | null;
};

function toPayload(s: FormState): FormPayload {
  return {
    ...s,
    receipts: s.receipts.map((r) => ({
      id: r.id,
      amountOre: parseAmountToOre(r.amount),
      date: r.date,
      note: r.note,
    })),
  };
}

/** Formaterar inmatning till ÅÅÅÅ-MM-DD medan man skriver. */
function maskDate(next: string, prev: string): string {
  // Om användaren raderar ett bindestreck ska även siffran före försvinna.
  if (next.length < prev.length && prev.endsWith("-") && next === prev.slice(0, -1)) {
    next = next.slice(0, -1);
  }
  const d = next.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 4);
  if (d.length > 4) out += "-" + d.slice(4, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  return out;
}

export function ExpenseForm({ expenseId, initial, status, adminMessage, committees, savedSignature }: Props) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Kontouppgifter som redan låg i formuläret när det öppnades kommer från ett
  // tidigare utlägg på samma inloggning. Delas kontot av flera personer kan de
  // tillhöra någon annan, så de måste kontrolleras innan man skickar in.
  const [prefilledAccount] = useState(() => Boolean(initial.accountNumber || initial.clearing));
  // Erbjudandet att återanvända signaturen visas när attesten kryssats i och rutan
  // fortfarande är tom. Det är ett aktivt val, eftersom flera personer kan dela
  // samma inloggning och signaturen då kan tillhöra någon annan.
  const [signatureOfferDismissed, setSignatureOfferDismissed] = useState(false);
  const [signatureKey, setSignatureKey] = useState(0);
  const showSignatureOffer =
    Boolean(savedSignature) && form.attest && !form.signatureData && !signatureOfferDismissed;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const setReceipt = (id: string, patch: Partial<FormReceipt>) => {
    dirty.current = true;
    setForm((f) => ({ ...f, receipts: f.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  };

  /**
   * Sätter ett kvittodatum och kontrollerar det direkt när det är fullständigt
   * ifyllt, i stället för att spara felet till inskicket. Ett halvskrivet datum
   * ger ingen varning, för då har man inte skrivit klart än.
   */
  const setReceiptDate = (id: string, index: number, value: string) => {
    setReceipt(id, { date: value });
    const key = `receipts.${index}.date`;
    const problem = value.length === 10 ? dateError(value) : null;
    setErrors((e) => ({ ...e, [key]: problem ?? "" }));
  };

  // Spara utkast automatiskt var 20:e sekund om något ändrats.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current || saving || busy) return;
      dirty.current = false;
      void saveDraft(expenseId, toPayload(form)).then((r) => {
        if (r.ok) setSavedAt(new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }));
      });
    }, 20000);
    return () => clearInterval(t);
  }, [form, expenseId, saving, busy]);

  const clearingInfo = useMemo(() => lookupClearing(form.clearing), [form.clearing]);
  const totalOre = useMemo(
    () => form.receipts.reduce((s, r) => s + (parseAmountToOre(r.amount) ?? 0), 0),
    [form.receipts],
  );

  /** De datum som faktiskt är ifyllda och giltiga, i ordning och utan dubbletter. */
  const chosenDates = useMemo(() => {
    const ok = form.receipts
      .map((r) => r.date)
      .filter((d) => d.length === 10 && dateError(d) === null);
    return [...new Set(ok)].sort();
  }, [form.receipts]);

  const onClearingChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 5);
    const info = lookupClearing(digits);
    dirty.current = true;
    setForm((f) => ({ ...f, clearing: digits, bankName: info ? info.bank : f.bankName }));
    if (errors.clearing || errors.bankName) setErrors((e) => ({ ...e, clearing: "", bankName: "" }));
  };

  const scrollToFirstError = (errs: Record<string, string>) => {
    const first = Object.keys(errs).find((k) => errs[k]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first.split(".")[0]}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const validateClient = (): boolean => {
    const parsed = expenseSchema.safeParse({
      ...form,
      receipts: form.receipts.map((r) => ({
        id: r.id,
        amountOre: parseAmountToOre(r.amount) ?? Number.NaN,
        date: r.date,
        note: r.note,
        fileIds: r.files.map((f) => f.id),
      })),
      attest: form.attest ? true : undefined,
    });
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const errs = flattenIssues(parsed.error.issues);
    setErrors(errs);
    setMessage("Några uppgifter saknas eller är felaktiga. Se de rödmarkerade fälten.");
    scrollToFirstError(errs);
    return false;
  };

  const onSaveDraft = async () => {
    setSaving(true);
    const r = await saveDraft(expenseId, toPayload(form));
    setSaving(false);
    dirty.current = false;
    if (r.ok) {
      setSavedAt(new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }));
      setMessage(null);
    }
  };

  const onSubmit = () => {
    setMessage(null);
    if (!validateClient()) return;
    startTransition(async () => {
      const r = await submitExpense(expenseId, toPayload(form));
      if (r && !r.ok) {
        setErrors(r.errors);
        setMessage(r.message ?? "Kunde inte skicka in utlägget.");
        scrollToFirstError(r.errors);
      }
    });
  };

  const onAddReceipt = async () => {
    if (form.receipts.length >= MAX_RECEIPTS) return;
    const { id } = await addReceipt(expenseId);
    dirty.current = true;
    setForm((f) => ({ ...f, receipts: [...f.receipts, { id, amount: "", date: "", note: "", files: [] }] }));
  };

  const onRemoveReceipt = async (id: string) => {
    if (form.receipts.length <= 1) return;
    const r = form.receipts.find((x) => x.id === id);
    if (r && (r.files.length || r.amount) && !confirm("Ta bort kvittot och dess filer?")) return;
    await removeReceipt(expenseId, id);
    dirty.current = true;
    setForm((f) => ({ ...f, receipts: f.receipts.filter((x) => x.id !== id) }));
  };

  const err = (key: string) => (errors[key] ? <div className="error">{errors[key]}</div> : null);
  const cls = (key: string, base: string) => `${base}${errors[key] ? " invalid" : ""}`;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      {status === "KOMPLETTERING" && adminMessage && (
        <div className="alert warn">
          <p>
            <strong>Kassören har begärt komplettering:</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{adminMessage}</p>
          <p className="small" style={{ margin: 0 }}>
            Åtgärda det som efterfrågas nedan, signera igen och skicka in utlägget på nytt.
          </p>
        </div>
      )}

      {/* ---------- 1. Vad gäller utlägget ---------- */}
      <section className="card">
        <div className="section-title">
          <span className="num">1</span>
          <h2 style={{ margin: 0 }}>Vad gäller utlägget?</h2>
        </div>

        <div className="row cols-2">
          <div className="field" data-field="committee">
            <label htmlFor="committee">Kommitté eller förening</label>
            <select
              id="committee"
              className={cls("committee", "select")}
              value={form.committee}
              onChange={(e) => set("committee", e.target.value)}
            >
              <option value="">Välj…</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={OTHER_COMMITTEE}>Annan…</option>
            </select>
            <p className="help">Vem gjordes köpet för? Kommitténs kassör får utlägget.</p>
            {err("committee")}
          </div>
          {form.committee === OTHER_COMMITTEE && (
            <div className="field" data-field="committeeOther">
              <label htmlFor="committeeOther">Vilken förening?</label>
              <input
                id="committeeOther"
                className={cls("committeeOther", "input")}
                value={form.committeeOther}
                onChange={(e) => set("committeeOther", e.target.value)}
                maxLength={60}
              />
              <p className="help">Utlägget hanteras av sektionskassören.</p>
              {err("committeeOther")}
            </div>
          )}
        </div>

        <div className="field" data-field="title">
          <label htmlFor="title">Titel för arrangemang</label>
          <input
            id="title"
            className={cls("title", "input")}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={80}
            placeholder="Fika till sektionsmöte 3"
          />
          <p className="help">Kort och tydligt, t.ex. ”Fika till sektionsmöte 3” eller ”Aspning M-Photo”.</p>
          {err("title")}
        </div>

        <div className="field" data-field="description">
          <label htmlFor="description">Beskrivning</label>
          <textarea
            id="description"
            className={cls("description", "textarea")}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={600}
          />
          <p className="help">
            Vad köptes, och varför? T.ex. ”Kanelbullar och kaffe till ca 60 deltagare på SM3”.
            <span style={{ float: "right" }}>{form.description.length}/600</span>
          </p>
          {err("description")}
        </div>

      </section>

      {/* ---------- 2. Kvitton ---------- */}
      <section className="card">
        <div className="section-title">
          <span className="num">2</span>
          <h2 style={{ margin: 0 }}>Kvitton och belopp</h2>
        </div>
        <p className="help" style={{ marginBottom: "1rem" }}>
          Ett kvitto i taget: ladda upp bilden eller PDF:en och ange kvittots belopp och datum. Kvittona kan vara
          från olika dagar. Har ett kvitto flera sidor, ladda upp alla sidorna under samma kvitto.
          Totalsumman räknas ut automatiskt.
        </p>
        <div className="alert info">
          <p>
            <strong>Fota rakt ovanifrån i bra ljus.</strong> Belopp, datum och butik måste gå att läsa, annars
            kan utlägget inte godkännas. Kontrollera bilden innan du går vidare.
          </p>
        </div>
        {errors.receipts && <div className="error" style={{ marginBottom: "0.5rem" }}>{errors.receipts}</div>}

        {form.receipts.map((r, i) => (
          <div className="receipt" key={r.id} data-field="receipts">
            <div className="receipt-head">
              <h3>Kvitto {i + 1}</h3>
              {form.receipts.length > 1 && (
                <button type="button" className="btn small ghost" onClick={() => onRemoveReceipt(r.id)}>
                  Ta bort
                </button>
              )}
            </div>
            <ReceiptUploader
              receiptId={r.id}
              files={r.files}
              onChange={(files: FormFile[]) => setReceipt(r.id, { files })}
            />
            {errors[`receipts.${i}.fileIds`] && <div className="error">{errors[`receipts.${i}.fileIds`]}</div>}
            <div className="row cols-3" style={{ marginTop: "0.75rem" }}>
              <div className="field compact">
                <label htmlFor={`amount-${r.id}`}>Belopp på kvittot</label>
                <div className="input-group">
                  <input
                    id={`amount-${r.id}`}
                    className={`input${errors[`receipts.${i}.amountOre`] ? " invalid" : ""}`}
                    inputMode="decimal"
                    placeholder="249,90"
                    value={r.amount}
                    onChange={(e) => setReceipt(r.id, { amount: e.target.value })}
                  />
                  <span className="suffix">kr</span>
                </div>
                {errors[`receipts.${i}.amountOre`] && <div className="error">{errors[`receipts.${i}.amountOre`]}</div>}
                {r.amount && parseAmountToOre(r.amount) === null && (
                  <div className="error">Skriv beloppet med siffror, t.ex. 249,90</div>
                )}
              </div>

              <div className="field compact" data-field={`receipts.${i}.date`}>
                <label htmlFor={`date-${r.id}`}>Datum på kvittot</label>
                <div className="input-group">
                  <input
                    id={`date-${r.id}`}
                    className={`input mono${errors[`receipts.${i}.date`] ? " invalid" : ""}`}
                    inputMode="numeric"
                    placeholder="ÅÅÅÅ-MM-DD"
                    maxLength={10}
                    autoComplete="off"
                    value={r.date}
                    onChange={(e) => setReceiptDate(r.id, i, maskDate(e.target.value, r.date))}
                  />
                  {/* Datumväljaren är ett riktigt date-fält som ligger genomskinligt ovanpå
                      ikonen. Att trycka på den öppnar mobilens egen väljare direkt, vilket
                      showPicker() inte gör i alla webbläsare. */}
                  <span className="suffix picker-wrap">
                    <span aria-hidden="true">📅</span>
                    <input
                      type="date"
                      className="picker-overlay"
                      aria-label={`Välj datum i kalender för kvitto ${i + 1}`}
                      max={todayISO()}
                      value={/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : ""}
                      onChange={(e) => setReceiptDate(r.id, i, e.target.value)}
                      onClick={(e) => {
                        const el = e.currentTarget;
                        if (typeof el.showPicker === "function") {
                          try {
                            el.showPicker();
                          } catch {
                            /* webbläsaren öppnar väljaren själv */
                          }
                        }
                      }}
                    />
                  </span>
                </div>
                {errors[`receipts.${i}.date`] ? (
                  <div className="error">{errors[`receipts.${i}.date`]}</div>
                ) : (
                  <p className="help">Datumet som står på just det här kvittot.</p>
                )}
              </div>

              <div className="field compact">
                <label htmlFor={`note-${r.id}`}>
                  Kommentar <span className="muted" style={{ fontWeight: 400 }}>(frivillig)</span>
                </label>
                <input
                  id={`note-${r.id}`}
                  className="input"
                  placeholder="T.ex. Coop, fika"
                  value={r.note}
                  maxLength={120}
                  onChange={(e) => setReceipt(r.id, { note: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="btn-row">
          <button type="button" className="btn" onClick={onAddReceipt} disabled={form.receipts.length >= MAX_RECEIPTS}>
            + Lägg till ett kvitto till
          </button>
        </div>
        <div className="total-box">
          <span>Summa att få tillbaka</span>
          <span className="amount">{formatSek(totalOre)}</span>
        </div>
        {chosenDates.length > 0 && (
          <div className="date-summary">
            <span className="label">
              {chosenDates.length === 1 ? "Valt datum" : `Valda datum (${chosenDates.length} st)`}
            </span>
            <span className="dates">
              {chosenDates.map((d) => (
                <span className="date-chip mono" key={d}>
                  {d}
                </span>
              ))}
            </span>
            {chosenDates.length > 1 && (
              <span className="small muted">
                Blanketten får {formatDate(new Date(chosenDates[chosenDates.length - 1]))} som köpdatum,
                och varje kvitto listas med sitt eget datum.
              </span>
            )}
          </div>
        )}
      </section>

      {/* ---------- 3. Utbetalning ---------- */}
      <section className="card">
        <div className="section-title">
          <span className="num">3</span>
          <h2 style={{ margin: 0 }}>Dina uppgifter och konto</h2>
        </div>
        <p className="help" style={{ marginBottom: "1rem" }}>
          Pengarna betalas till det här kontot. Uppgifterna sparas så att de är förifyllda nästa gång.
        </p>
        {prefilledAccount && (
          <div className="alert warn">
            <p>
              <strong>Kontrollera att kontot är ditt.</strong> Uppgifterna nedan är förifyllda från det
              senaste utlägget som gjordes med den här inloggningen. Delar ni på ett gemensamt konto kan de
              tillhöra någon annan.
            </p>
          </div>
        )}
        <div className="row cols-2">
          <div className="field" data-field="payeeName">
            <label htmlFor="payeeName">Namn</label>
            <input
              id="payeeName"
              className={cls("payeeName", "input")}
              value={form.payeeName}
              onChange={(e) => set("payeeName", e.target.value)}
              autoComplete="name"
            />
            <p className="help">För- och efternamn, som det står på kontot.</p>
            {err("payeeName")}
          </div>
          <div className="field" data-field="payeeEmail">
            <label htmlFor="payeeEmail">E-post</label>
            <input
              id="payeeEmail"
              className={cls("payeeEmail", "input")}
              type="email"
              value={form.payeeEmail}
              onChange={(e) => set("payeeEmail", e.target.value)}
              autoComplete="email"
            />
            <p className="help">Hit skickas bekräftelser när utlägget godkänns och betalas ut.</p>
            {err("payeeEmail")}
          </div>
        </div>
        <div className="row cols-3">
          <div className="field" data-field="clearing">
            <label htmlFor="clearing">Clearingnummer</label>
            <input
              id="clearing"
              className={cls("clearing", "input")}
              inputMode="numeric"
              value={form.clearing}
              onChange={(e) => onClearingChange(e.target.value)}
              placeholder="8327"
            />
            {clearingInfo && !errors.clearing ? (
              <p className="help ok">{clearingInfo.bank}</p>
            ) : (
              <p className="help">4 siffror. Swedbank som börjar på 8: 5 siffror.</p>
            )}
            {err("clearing")}
          </div>
          <div className="field" data-field="bankName">
            <label htmlFor="bankName">Bank</label>
            <input
              id="bankName"
              className={cls("bankName", "input")}
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              placeholder="Swedbank"
            />
            <p className="help">Fylls i automatiskt från clearingnumret.</p>
            {err("bankName")}
          </div>
          <div className="field" data-field="accountNumber">
            <label htmlFor="accountNumber">Kontonummer</label>
            <input
              id="accountNumber"
              className={cls("accountNumber", "input")}
              inputMode="numeric"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value.replace(/[^\d\s-]/g, ""))}
              placeholder="1234567890"
            />
            <p className="help">Bara siffror, utan clearingnummer.</p>
            {err("accountNumber")}
          </div>
        </div>
      </section>

      {/* ---------- 4. Attest ---------- */}
      <section className="card">
        <div className="section-title">
          <span className="num">4</span>
          <h2 style={{ margin: 0 }}>Attest och signatur</h2>
        </div>
        <div className="field" data-field="attest">
          <label className="checkbox">
            <input type="checkbox" checked={form.attest} onChange={(e) => set("attest", e.target.checked)} />
            <span>{ATTEST_TEXT}</span>
          </label>
          {err("attest")}
        </div>
        {showSignatureOffer && (
          <div className="alert info signature-offer">
            <p>
              <strong>Vill du använda din signatur från ditt föregående utlägg?</strong>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="signature-img" src={savedSignature!} alt="Din sparade signatur" />
            <div className="btn-row" style={{ marginTop: "0.6rem" }}>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  set("signatureData", savedSignature!);
                  setSignatureKey((k) => k + 1);
                }}
              >
                Ja tack!
              </button>
              <button type="button" className="btn small" onClick={() => setSignatureOfferDismissed(true)}>
                Nej, jag signerar på nytt
              </button>
            </div>
            <p className="small muted" style={{ margin: "0.6rem 0 0" }}>
              Kontrollera att signaturen är din innan du skickar in. Delar ni på en inloggning kan
              den tillhöra någon annan.
            </p>
          </div>
        )}
        <div className="field" data-field="signatureData">
          <span className="label">Signatur</span>
          <SignaturePad
            key={signatureKey}
            value={form.signatureData}
            onChange={(v) => set("signatureData", v)}
          />
          <p className="help">Skriv din namnteckning i rutan. Den hamnar på utläggsblanketten.</p>
          {err("signatureData")}
        </div>
      </section>

      {message && (
        <div className="alert error">
          <p>{message}</p>
        </div>
      )}

      <div className="card">
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <div className="btn-row">
            <button type="button" className="btn" onClick={onSaveDraft} disabled={saving || busy}>
              {saving ? "Sparar…" : "Spara utkast"}
            </button>
            {savedAt && <span className="small muted">Sparat {savedAt}</span>}
          </div>
          <button type="submit" className="btn primary large" disabled={busy}>
            {busy ? "Skickar…" : status === "KOMPLETTERING" ? "Skicka in igen" : "Skicka in utlägget"}
          </button>
        </div>
        <p className="small muted" style={{ margin: "0.75rem 0 0" }}>
          När du skickat in kan du inte längre ändra utlägget. Kassören granskar det och hör av sig via mail.
        </p>
      </div>
    </form>
  );
}
