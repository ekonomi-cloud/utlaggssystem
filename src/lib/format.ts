// Formatering av belopp och datum. Kan användas både på server och klient.

/** Öre -> "1 234,50 kr" */
export function formatSek(ore: number, withUnit = true): string {
  const negative = ore < 0;
  const abs = Math.abs(ore);
  const kr = Math.floor(abs / 100);
  const rest = abs % 100;
  const krStr = kr.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const s = `${negative ? "−" : ""}${krStr},${rest.toString().padStart(2, "0")}`;
  return withUnit ? `${s} kr` : s;
}

/** "1 234,50" / "1234.5" / "1234" -> öre. null om ogiltigt. */
export function parseAmountToOre(input: string): number | null {
  const s = input.replace(/\s|kr|SEK|:-/gi, "").replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [kr, dec = ""] = s.split(".");
  return Number(kr) * 100 + Number(dec.padEnd(2, "0"));
}

/** Öre -> "1234,50" (för inmatningsfält). */
export function oreToInput(ore: number): string {
  if (!ore) return "";
  return `${Math.floor(ore / 100)},${(ore % 100).toString().padStart(2, "0")}`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * Kalenderdatum (t.ex. datumet på ett kvitto) som ÅÅÅÅ-MM-DD.
 *
 * Sådana datum lagras som midnatt i UTC, så att de betyder samma dag oavsett
 * vilken tidszon servern råkar köra i. Därför läses de också ut i UTC: gör man
 * det i lokal tid hoppar datumet en dag i halva världen.
 */
export function formatDay(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Tidpunkt (t.ex. när något godkändes) som ÅÅÅÅ-MM-DD i lokal tid. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Datum och tid som ÅÅÅÅ-MM-DD HH:MM. */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Dagens datum som ÅÅÅÅ-MM-DD. */
export function todayISO(): string {
  return formatDate(new Date());
}

/**
 * "ÅÅÅÅ-MM-DD" -> Date vid midnatt i UTC, eller null om dagen inte finns.
 * UTC gör datumet oberoende av serverns tidszon, se formatDay.
 */
export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  return d;
}

/** Dagens datum minus ett antal år, som ÅÅÅÅ-MM-DD i lokal tid. */
export function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return formatDate(d);
}

/** Löpnummer som "2026-007". */
export function formatNumber(year: number | null | undefined, number: number | null | undefined): string {
  if (!year || !number) return "–";
  return `${year}-${number.toString().padStart(3, "0")}`;
}

/** Gör en sträng säker att använda i ett filnamn. */
export function safeFilename(s: string, max = 60): string {
  return s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
