// Konfiguration som är enkel att ändra utan att röra resten av koden.

/** Kommittéer och föreningar som ett utlägg kan göras för. */
export const COMMITTEES: string[] = [
  "M-Styret",
  "M-ord",
  "Valberedningen",
  "M-sex",
  "Rustmästeriet",
  "M.A.K.",
  "MGK",
  "MISS",
  "MnollK",
  "M-Photo",
  "MALT",
  "Bakmaskinen",
  "MARM",
  "MUU",
  "M-Likhet",
  "Caster",
  "eXPerimentverkstaden",
];

/** Värdet i formulärets rullista som betyder "Annan förening" (fritext). */
export const OTHER_COMMITTEE = "__annan__";
/** Prefix på Expense.committee när utläggaren valt "Annan". */
export const OTHER_PREFIX = "Annan: ";

/** Antal dagar ett utlägg får ligga obehandlat/obetalt innan kassören påminns (och sedan igen lika ofta). */
export function reminderDays(): number {
  return Number(process.env.REMINDER_DAYS || 7);
}
/** Antal dagar efter utbetalning (eller nekande) som kontonumret behålls i databasen. */
export function accountRetentionDays(): number {
  return Number(process.env.ACCOUNT_RETENTION_DAYS || 90);
}
/** Utkast som inte rörts på så här många dagar tas bort. */
export function draftRetentionDays(): number {
  return Number(process.env.DRAFT_RETENTION_DAYS || 60);
}

/** Statusar ett utlägg kan ha, i den ordning de normalt inträffar. */
export const STATUS = {
  UTKAST: "UTKAST",
  INSKICKAD: "INSKICKAD",
  KOMPLETTERING: "KOMPLETTERING",
  GODKAND: "GODKAND",
  NEKAD: "NEKAD",
  UTBETALD: "UTBETALD",
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export const STATUS_LABEL: Record<Status, string> = {
  UTKAST: "Utkast",
  INSKICKAD: "Inskickat",
  KOMPLETTERING: "Komplettering begärd",
  GODKAND: "Godkänt",
  NEKAD: "Nekat",
  UTBETALD: "Utbetalt",
};

export const STATUS_DESCRIPTION: Record<Status, string> = {
  UTKAST: "Utlägget är påbörjat men inte inskickat.",
  INSKICKAD: "Utlägget väntar på att kassören ska granska det.",
  KOMPLETTERING: "Kassören behöver mer information. Öppna utlägget, åtgärda och skicka in igen.",
  GODKAND: "Utlägget är godkänt. Utbetalning sker inom kort.",
  NEKAD: "Utlägget har nekats. Se kassörens meddelande.",
  UTBETALD: "Pengarna är överförda till ditt konto.",
};

/** Statusar där utläggaren får redigera utlägget. */
export const EDITABLE_STATUSES: Status[] = [STATUS.UTKAST, STATUS.KOMPLETTERING];

/** Tillåtna filtyper för kvitton. */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per fil
export const MAX_FILES_PER_RECEIPT = 5;
export const MAX_RECEIPTS = 20;

/** Bilder med kortare långsida än detta får en varning om att kvittot kan vara svårläst. */
export const MIN_IMAGE_LONG_SIDE = 900;

export const ATTEST_TEXT =
  "Jag intygar att uppgifterna ovan stämmer och att utlägget gynnar gemene maskinteknolog.";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Verksamhetsår: 1 juli–30 juni. Returnerar året verksamhetsåret börjar. */
export function fiscalYear(d: Date = new Date()): number {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}
