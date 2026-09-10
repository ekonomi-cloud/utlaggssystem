import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { google } from "googleapis";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatDate, formatSek } from "@/lib/format";
import { STATUS_LABEL, type Status } from "@/lib/config";

/**
 * Mail kan skickas på tre sätt, i den här ordningen:
 *
 *  1. "gmail"  – Googles mail-API över HTTPS, med samma inloggning som Drive.
 *                Krävs på plattformar som blockerar utgående SMTP (t.ex. Railway).
 *  2. "smtp"   – vanlig SMTP, om SMTP_HOST är satt och Gmail-API:t inte är det.
 *  3. "outbox" – ingenting konfigurerat: mailen sparas som .eml-filer i data/outbox
 *                och loggas i terminalen. Används vid lokal utveckling.
 *
 * MAIL_TRANSPORT kan sättas till gmail, smtp eller outbox för att tvinga ett visst val.
 */
export type Transport = "gmail" | "smtp" | "outbox";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

function from(): string {
  return process.env.MAIL_FROM || "Maskinteknologsektionen <ekonomi@mtek.chalmers.se>";
}

/** Sektionskassörens adress: får notiser för utlägg utan egen kommittékassör. */
export function adminMail(): string {
  return process.env.MAIL_ADMIN || "ekonomi@mtek.chalmers.se";
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Refresh-token för Drive (ekonomi@). */
export function googleRefreshToken(): string | undefined {
  return process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || undefined;
}

/**
 * Refresh-token som mailen skickas med. Är MAIL_GOOGLE_REFRESH_TOKEN satt skickas
 * mailen som det kontot (utlagg@, "utläggsboten"), oberoende av vem som är kassör.
 * Annars används samma konto som för Drive.
 */
export function mailRefreshToken(): string | undefined {
  return process.env.MAIL_GOOGLE_REFRESH_TOKEN || googleRefreshToken();
}

export function gmailConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && mailRefreshToken());
}

/** Vilket sätt som faktiskt kommer att användas. */
export function mailTransport(): Transport {
  const forced = (process.env.MAIL_TRANSPORT || "").trim().toLowerCase();
  if (forced === "gmail" || forced === "smtp" || forced === "outbox") return forced;
  if (gmailConfigured()) return "gmail";
  if (smtpConfigured()) return "smtp";
  return "outbox";
}

export function transportLabel(t: Transport = mailTransport()): string {
  if (t === "gmail") {
    const egen = Boolean(process.env.MAIL_GOOGLE_REFRESH_TOKEN);
    return `Googles mail-API${egen ? " (eget botkonto)" : " (samma konto som Drive)"}`;
  }
  if (t === "smtp") return `SMTP via ${process.env.SMTP_HOST}`;
  return "Ingen utskick konfigurerad (mail sparas i data/outbox)";
}

/** Bygger ett färdigt MIME-meddelande, som Gmail-API:t vill ha det. */
async function buildMime(mail: Mail): Promise<Buffer> {
  const composer = new MailComposer({
    from: from(),
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments,
  });
  return composer.compile().build();
}

async function sendViaGmail(mail: Mail): Promise<void> {
  const oauth = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  oauth.setCredentials({ refresh_token: mailRefreshToken() });
  const gmail = google.gmail({ version: "v1", auth: oauth });
  const raw = (await buildMime(mail)).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

async function sendViaSmtp(mail: Mail): Promise<void> {
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Utan tidsgränser hänger ett blockerat utgående nät i två minuter och
    // låser gränssnittet. Hellre ett tydligt fel efter tio sekunder.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({
    from: from(),
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments,
  });
}

async function saveToOutbox(mail: Mail): Promise<void> {
  const dir = path.resolve("./data/outbox");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.eml`;
  const headers = [
    `From: ${from()}`,
    `To: ${mail.to}`,
    ...(mail.replyTo ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: ${mail.subject}`,
    `Date: ${new Date().toUTCString()}`,
    ...(mail.attachments?.length
      ? [`X-Attachments: ${mail.attachments.map((a) => a.filename).join(", ")}`]
      : []),
  ];
  const body = `${headers.join("\n")}\n\n${mail.text}\n`;
  await writeFile(path.join(dir, name), body, "utf8");
  console.log(`[mail] (inget utskick konfigurerat) sparade ${name}: "${mail.subject}" till ${mail.to}`);
}

export async function sendMail(mail: Mail): Promise<void> {
  const t = mailTransport();
  if (t === "gmail") return sendViaGmail(mail);
  if (t === "smtp") return sendViaSmtp(mail);
  return saveToOutbox(mail);
}

// ---------- Mallar ----------

export type ExpenseInfo = {
  id: string;
  title: string;
  payeeName: string;
  payeeEmail: string;
  totalOre: number;
  numberLabel: string;
  committee?: string | null;
};

export function appUrl(pathname: string): string {
  const base = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname}`;
}

/**
 * Kontaktuppgift som skrivs ut i mailen till utläggaren: den kassör som äger
 * utlägget. Adressen sätts också som svarsadress, så att ett svar på mailet
 * landar hos rätt person i stället för hos avsändaren (utläggsboten).
 */
export type Contact = { email: string; committee?: string | null };

/** "Kassören för M-ord", eller "Sektionens kassör" när kommittén saknar egen. */
function contactName(c: Contact): string {
  return c.committee && c.email !== adminMail() ? `Kassören för ${c.committee}` : "Sektionens kassör";
}

/** Avslutning med kontaktuppgift och avsändarnamn. */
function footer(c: Contact): string {
  return [
    "",
    "",
    `Frågor om det här utlägget? Svara på det här mailet, eller skriv direkt till ${c.email}.`,
    "",
    "Hälsningar,",
    "Utläggsboten, Maskinteknologsektionen",
  ].join("\n");
}

/** Bekräftelse till utläggaren och notis till ansvarig kassör. */
export async function mailSubmitted(e: ExpenseInfo, resubmitted: boolean, contact: Contact): Promise<void> {
  await Promise.all([
    sendMail({
      to: e.payeeEmail,
      replyTo: contact.email,
      subject: `Ditt utlägg "${e.title}" är inskickat`,
      text:
        [
          `Hej ${e.payeeName}!`,
          "",
          `Ditt utlägg "${e.title}" (${e.numberLabel}) på ${formatSek(e.totalOre)} är ${resubmitted ? "inskickat igen" : "inskickat"}. ` +
            `${contactName(contact)} granskar det nu, och du hör av oss igen när pengarna är på väg.`,
          "",
          `Du kan följa utlägget här: ${appUrl(`/utlagg/${e.id}`)}`,
        ].join("\n") + footer(contact),
    }),
    sendMail({
      to: contact.email,
      replyTo: e.payeeEmail,
      subject: `${resubmitted ? "Kompletterat" : "Nytt"} utlägg ${e.numberLabel}: ${e.title} – ${e.payeeName} (${formatSek(e.totalOre)})`,
      text: [
        `${e.payeeName} har ${resubmitted ? "kompletterat" : "skickat in"} ett utlägg${e.committee ? ` för ${e.committee}` : ""}.`,
        "",
        `Titel: ${e.title}`,
        `Summa: ${formatSek(e.totalOre)}`,
        `Nummer: ${e.numberLabel}`,
        "",
        `Granska det här: ${appUrl(`/admin/${e.id}`)}`,
        "",
        `Svara på det här mailet för att nå ${e.payeeName} direkt.`,
      ].join("\n"),
    }),
  ]);
}

/**
 * Skickas när utlägget markerats som utbetalt. Först här bifogas blanketten,
 * eftersom den inte är komplett förrän utbetalningsdatumet står i den.
 * Något separat mail vid godkännande skickas medvetet inte: utlägg godkänns
 * och betalas i praktiken samtidigt, och statusen syns ändå på webben.
 */
export async function mailPaid(
  e: ExpenseInfo,
  contact: Contact,
  pdf?: { filename: string; content: Buffer },
): Promise<void> {
  await sendMail({
    to: e.payeeEmail,
    replyTo: contact.email,
    subject: `Ditt utlägg "${e.title}" är utbetalt`,
    text:
      [
        `Hej ${e.payeeName}!`,
        "",
        `Ditt utlägg "${e.title}" ska nu ha betalats ut! Förvänta dig att se pengarna landa på ditt angivna konto inom kort.`,
        "",
        `Summa: ${formatSek(e.totalOre)}`,
        `Nummer: ${e.numberLabel}`,
        ...(pdf ? ["", "Den färdiga utläggsblanketten med kvitton bifogas för din egen bokföring."] : []),
      ].join("\n") + footer(contact),
    attachments: pdf ? [{ filename: pdf.filename, content: pdf.content, contentType: "application/pdf" }] : undefined,
  });

  // Arkivkopia av den färdiga blanketten, om en arkivadress är angiven.
  const archive = process.env.MAIL_ARCHIVE;
  if (archive && pdf) {
    await sendMail({
      to: archive,
      subject: `${e.numberLabel} ${e.title} – ${e.payeeName}`,
      text: [
        "Utbetald utläggsblankett bifogad.",
        "",
        `Summa: ${formatSek(e.totalOre)}`,
        ...(e.committee ? [`Kommitté: ${e.committee}`] : []),
      ].join("\n"),
      attachments: [{ filename: pdf.filename, content: pdf.content, contentType: "application/pdf" }],
    });
  }
}

export async function mailComplementRequested(e: ExpenseInfo, message: string, contact: Contact): Promise<void> {
  await sendMail({
    to: e.payeeEmail,
    replyTo: contact.email,
    subject: `Ditt utlägg "${e.title}" behöver kompletteras`,
    text:
      [
        `Hej ${e.payeeName}!`,
        "",
        `${contactName(contact)} behöver mer information för att kunna godkänna ditt utlägg "${e.title}" (${e.numberLabel}):`,
        "",
        `  "${message}"`,
        "",
        "Öppna utlägget, åtgärda det som saknas och skicka in det igen:",
        appUrl(`/utlagg/${e.id}`),
      ].join("\n") + footer(contact),
  });
}

export async function mailRejected(e: ExpenseInfo, message: string, contact: Contact): Promise<void> {
  await sendMail({
    to: e.payeeEmail,
    replyTo: contact.email,
    subject: `Ditt utlägg "${e.title}" har nekats`,
    text:
      [
        `Hej ${e.payeeName}!`,
        "",
        `Ditt utlägg "${e.title}" (${e.numberLabel}) har tyvärr nekats med följande motivering:`,
        "",
        `  "${message}"`,
      ].join("\n") + footer(contact),
  });
}

export type ReminderItem = {
  id: string;
  numberLabel: string;
  title: string;
  payeeName: string;
  totalOre: number;
  status: string;
  since: Date;
};

/** Påminnelse till en kassör om utlägg som väntar på beslut eller utbetalning. */
export async function mailReminder(to: string, items: ReminderItem[]): Promise<void> {
  const now = Date.now();
  const lines = items.map((i) => {
    const days = Math.floor((now - i.since.getTime()) / 86_400_000);
    const label = STATUS_LABEL[i.status as Status] ?? i.status;
    return `• ${i.numberLabel} ${i.title} – ${i.payeeName}, ${formatSek(i.totalOre)}. ${label} ${formatDate(i.since)} (${days} dagar sedan)\n  ${appUrl(`/admin/${i.id}`)}`;
  });
  const waiting = items.filter((i) => i.status === "INSKICKAD").length;
  const unpaid = items.length - waiting;
  const parts = [
    waiting ? `${waiting} väntar på ditt beslut` : "",
    unpaid ? `${unpaid} ${unpaid === 1 ? "är godkänt" : "är godkända"} men inte ${unpaid === 1 ? "markerat" : "markerade"} som utbetalt` : "",
  ].filter(Boolean);
  await sendMail({
    to,
    subject: `Påminnelse: ${items.length} utlägg väntar på dig`,
    text:
      `Hej!\n\n` +
      `Följande utlägg har väntat ett tag (${parts.join(", ")}):\n\n` +
      lines.join("\n\n") +
      `\n\nÖppna kassörsvyn: ${appUrl("/admin")}\n\nDu får en ny påminnelse om en vecka om utläggen fortfarande väntar.`,
  });
}
