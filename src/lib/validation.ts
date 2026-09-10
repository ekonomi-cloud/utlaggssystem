import { z } from "zod";
import { OTHER_COMMITTEE, OTHER_PREFIX, MAX_RECEIPTS } from "@/lib/config";
import { lookupClearing, normalizeAccount, normalizeClearing } from "@/lib/banks";
import { isoYearsAgo, parseISODate, todayISO } from "@/lib/format";

// Valideringsregler för ett utlägg. Samma regler används i webbläsaren
// (för direkt återkoppling) och på servern (som avgör).

/**
 * Kontrollerar ett datum skrivet som ÅÅÅÅ-MM-DD och returnerar ett felmeddelande,
 * eller null om det duger. Används både av formuläret, som visar felet så snart
 * datumet är fullständigt ifyllt, och av zod-schemat som avgör vid inskick.
 */
export function dateError(value: string): string | null {
  const s = value.trim();
  if (!s) return "Ange datumet på kvittot";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Skriv datumet som ÅÅÅÅ-MM-DD, t.ex. 2026-03-05";
  if (!parseISODate(s)) return "Det datumet finns inte, kontrollera månad och dag";
  // Jämför som text: ISO-datum sorteras som kalenderdatum, vilket undviker
  // tidszonsfällor kring midnatt.
  if (s > todayISO()) return "Datumet kan inte vara i framtiden";
  if (s < isoYearsAgo(2)) return "Datumet ligger mer än två år tillbaka, kontrollera att det stämmer";
  return null;
}

export const receiptSchema = z.object({
  id: z.string().min(1),
  amountOre: z
    .number({ error: "Ange kvittots belopp, t.ex. 249,90" })
    .int()
    .positive("Beloppet måste vara större än 0"),
  date: z.string().superRefine((v, ctx) => {
    const problem = dateError(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  note: z.string().trim().max(120, "Max 120 tecken").optional().default(""),
  fileIds: z.array(z.string()).min(1, "Ladda upp minst en bild eller PDF av kvittot"),
});

export const expenseSchema = z
  .object({
    committee: z.string().trim().min(1, "Välj vilken kommitté eller förening utlägget gäller"),
    committeeOther: z.string().trim().max(60, "Max 60 tecken").optional().default(""),
    title: z
      .string()
      .trim()
      .min(3, "Ange en kort titel, t.ex. ”Fika till sektionsmöte 3”")
      .max(80, "Max 80 tecken"),
    description: z
      .string()
      .trim()
      .min(10, "Beskriv vad som köptes och varför (minst 10 tecken)")
      .max(600, "Max 600 tecken"),
    payeeName: z.string().trim().min(2, "Ange ditt för- och efternamn").max(80, "Max 80 tecken"),
    payeeEmail: z.string().trim().toLowerCase().email("Ange en giltig e-postadress"),
    clearing: z
      .string()
      .transform(normalizeClearing)
      .refine((s) => s.length === 4 || s.length === 5, "Clearingnumret har 4 siffror (Swedbank 8xxx-x har 5)")
      .refine((s) => lookupClearing(s) !== null, "Clearingnumret matchar ingen svensk bank, kontrollera siffrorna")
      .refine((s) => {
        const info = lookupClearing(s);
        return !info || s.length === info.expectedDigits;
      }, "Clearingnummer som börjar på 8 (Swedbank) ska ha 5 siffror"),
    bankName: z.string().trim().min(2, "Ange bank").max(60, "Max 60 tecken"),
    accountNumber: z
      .string()
      .transform(normalizeAccount)
      .refine((s) => s.length >= 5 && s.length <= 12, "Kontonumret ska bestå av 5–12 siffror, utan clearingnummer"),
    receipts: z
      .array(receiptSchema)
      .min(1, "Lägg till minst ett kvitto")
      .max(MAX_RECEIPTS, `Max ${MAX_RECEIPTS} kvitton per utlägg`),
    signatureData: z
      .string()
      .startsWith("data:image/png;base64,", "Signera i rutan innan du skickar in")
      .min(200, "Signera i rutan innan du skickar in"),
    attest: z.literal(true, { error: "Du måste intyga att uppgifterna stämmer" }),
  })
  .superRefine((v, ctx) => {
    if (v.committee === OTHER_COMMITTEE && v.committeeOther.length < 2) {
      ctx.addIssue({ code: "custom", path: ["committeeOther"], message: "Ange vilken förening det gäller" });
    }
  });

export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseValidated = z.output<typeof expenseSchema>;

/** Plattar ut zod-fel till { "fältnamn": "meddelande" }. */
export function flattenIssues(issues: z.ZodError["issues"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Texten som ska stå på blanketten när utläggaren valt "Annan". */
export function otherCommitteeLabel(other: string): string {
  return `${OTHER_PREFIX}${other.trim()}`;
}
