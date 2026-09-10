import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ExpenseWithAll } from "@/components/ExpenseDetails";
import { decrypt } from "@/lib/crypto";
import { formatDate, formatDay, formatNumber, formatSek, safeFilename } from "@/lib/format";
import { readUpload } from "@/lib/storage";
import { ATTEST_TEXT } from "@/lib/config";

// Genererar den ifyllda utläggsblanketten som PDF, med kvittona som efterföljande sidor.

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // marginal
const BROWN = rgb(0.306, 0.204, 0.18); // #4E342E
const GRAY = rgb(0.45, 0.45, 0.45);
const BLACK = rgb(0.1, 0.1, 0.1);
const LINE = rgb(0.75, 0.75, 0.75);

type Fonts = { regular: PDFFont; bold: PDFFont };

export type Treasurer = { name: string; signatureData: string | null };

async function asset(rel: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ path.join(process.cwd(), "assets", rel));
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // Bryt mycket långa ord
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

/** Ersätter tecken som fonten saknar med "?" så att inbäddningen inte kraschar. */
function sanitize(s: string, font: PDFFont): string {
  let out = "";
  for (const ch of s) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

async function embedDataUrlPng(doc: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return null;
  try {
    return await doc.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
  } catch {
    return null;
  }
}

type Row = { label: string; value: string; height?: number; image?: PDFImage | null; imageCaption?: string };

/** Ritar blankettsidan och returnerar den. */
async function drawForm(
  doc: PDFDocument,
  fonts: Fonts,
  expense: ExpenseWithAll,
  treasurer: Treasurer,
  logo: PDFImage | null,
): Promise<void> {
  const page = doc.addPage([A4.w, A4.h]);
  const { regular, bold } = fonts;
  const contentW = A4.w - 2 * M;
  let y = A4.h - M;

  const text = (s: string, x: number, yy: number, size: number, font = regular, color = BLACK) => {
    page.drawText(sanitize(s, font), { x, y: yy, size, font, color });
  };

  // Rubrik och logga
  text("Utläggsblankett", M, y - 22, 24, bold, BROWN);
  text("Maskinteknologsektionen, Chalmers", M, y - 40, 10, regular, GRAY);
  text(
    `Utlägg nr ${formatNumber(expense.year, expense.number)}  ·  ${expense.committee ?? ""}`,
    M,
    y - 54,
    10,
    bold,
    BROWN,
  );
  if (logo) {
    const lw = 78;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: A4.w - M - lw, y: y - lh + 4, width: lw, height: lh });
  }
  y -= 80;

  const payeeSig = await embedDataUrlPng(doc, expense.signatureData);
  const account = decrypt(expense.accountNumber);

  // Kvittona kan komma från olika dagar. Blanketten har ett fält för köpdatum,
  // så där visas antingen dagen eller spannet, och varje kvitto listas nedan
  // med sitt eget datum.
  const receiptDates = [...new Set(expense.receipts.map((r) => formatDay(r.purchaseDate)).filter(Boolean))].sort();
  const dateLabel =
    receiptDates.length > 1
      ? `${receiptDates[0]} – ${receiptDates[receiptDates.length - 1]} (${receiptDates.length} datum)`
      : (receiptDates[0] ?? formatDay(expense.purchaseDate));

  const rows: Row[] = [
    { label: "Titel för arrangemang", value: expense.title ?? "" },
    { label: "Beskrivning", value: expense.description ?? "" },
    { label: "Datum (vid köp)", value: dateLabel },
    { label: "Summa", value: `${formatSek(expense.totalOre)}` },
    { label: "Namn", value: expense.payeeName ?? "" },
    { label: "E-post", value: expense.payeeEmail ?? "" },
    { label: "Bank", value: expense.bankName ?? "" },
  ];

  const labelSize = 8.5;
  const valueSize = 11.5;
  const pad = 7;

  const drawBox = (x: number, yTop: number, w: number, h: number) => {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: BLACK, borderWidth: 1 });
  };

  const drawCell = (x: number, yTop: number, w: number, label: string, value: string): number => {
    const lines = wrap(value, regular, valueSize, w - 2 * pad);
    const h = pad + labelSize + 4 + lines.length * (valueSize + 3) + pad;
    drawBox(x, yTop, w, h);
    text(label, x + pad, yTop - pad - labelSize + 1, labelSize, regular, GRAY);
    let ly = yTop - pad - labelSize - 6 - valueSize + 2;
    for (const l of lines) {
      text(l, x + pad, ly, valueSize, regular);
      ly -= valueSize + 3;
    }
    return h;
  };

  for (const r of rows) {
    const h = drawCell(M, y, contentW, r.label, r.value);
    y -= h;
  }
  // Clearing + kontonummer bredvid varandra
  {
    const w1 = contentW * 0.35;
    const h1 = drawCell(M, y, w1, "Clearingnr", expense.clearing ?? "");
    const h2 = drawCell(M + w1, y, contentW - w1, "Kontonr", account);
    y -= Math.max(h1, h2);
  }

  // Delbelopp om fler än ett kvitto
  if (expense.receipts.length > 1) {
    const lines = expense.receipts.map((r, i) => {
      const d = formatDay(r.purchaseDate);
      return `Kvitto ${i + 1}: ${formatSek(r.amountOre)}${d ? `  ${d}` : ""}${r.note ? `  (${r.note})` : ""}`;
    });
    const h = drawCell(M, y, contentW, "Delbelopp och datum per kvitto", lines.join("\n"));
    y -= h;
  }

  // Attest
  {
    const h = 74;
    drawBox(M, y, contentW, h);
    text("Attest (utläggaren)", M + pad, y - pad - labelSize + 1, labelSize, regular, GRAY);
    const attestLines = wrap(ATTEST_TEXT, regular, 8, contentW * 0.5 - 2 * pad);
    let ly = y - pad - labelSize - 8 - 8;
    for (const l of attestLines) {
      text(l, M + pad, ly, 8, regular, GRAY);
      ly -= 10;
    }
    text(
      `${expense.payeeName ?? ""}, ${formatDate(expense.signedAt)}`,
      M + pad,
      y - h + pad,
      9,
      regular,
    );
    if (payeeSig) {
      const maxW = contentW * 0.45;
      const maxH = h - 2 * pad - 4;
      const scale = Math.min(maxW / payeeSig.width, maxH / payeeSig.height);
      const sw = payeeSig.width * scale;
      const sh = payeeSig.height * scale;
      page.drawImage(payeeSig, { x: M + contentW - pad - sw, y: y - pad - sh, width: sw, height: sh });
    }
    y -= h;
  }

  y -= 16;

  // Kassörens ruta
  {
    const h = 82;
    page.drawRectangle({ x: M, y: y - h, width: contentW, height: h, borderColor: BLACK, borderWidth: 1.5 });
    text("Fylls i av kassören som betalar utlägget", M + pad, y - pad - 9, 9.5, bold);
    const paid = expense.paidAt ? formatDate(expense.paidAt) : "";
    text(`Namn: ${treasurer.name}`, M + pad, y - 34, 10, regular);
    text(`Datum för godkännande: ${formatDate(expense.approvedAt)}`, M + pad, y - 50, 10, regular);
    text(`Datum för utbetalning: ${paid || "________________"}`, M + pad, y - 66, 10, regular);
    const sigX = M + contentW * 0.55;
    text("Attest:", sigX, y - 34, 10, regular);
    const treasurerSig = await embedDataUrlPng(doc, treasurer.signatureData);
    if (treasurerSig && expense.approvedAt) {
      const maxW = contentW * 0.42;
      const maxH = 44;
      const scale = Math.min(maxW / treasurerSig.width, maxH / treasurerSig.height);
      const sw = treasurerSig.width * scale;
      const sh = treasurerSig.height * scale;
      page.drawImage(treasurerSig, { x: sigX + 38, y: y - 30 - sh, width: sw, height: sh });
    }
    page.drawLine({ start: { x: sigX + 38, y: y - h + 12 }, end: { x: M + contentW - pad, y: y - h + 12 }, thickness: 0.5, color: LINE });
    y -= h;
  }

  // Sidfot
  const fileCount = expense.receipts.reduce((n, r) => n + r.files.length, 0);
  text(
    `Skapad i sektionens utläggssystem ${formatDate(new Date())}. ${fileCount} kvittofil${fileCount === 1 ? "" : "er"} följer på nästa sida.`,
    M,
    M - 14,
    8,
    regular,
    GRAY,
  );
}

async function appendReceipts(doc: PDFDocument, fonts: Fonts, expense: ExpenseWithAll): Promise<void> {
  let ri = 0;
  for (const receipt of expense.receipts) {
    ri++;
    let fi = 0;
    for (const file of receipt.files) {
      fi++;
      const datum = formatDay(receipt.purchaseDate);
      const caption = `Kvitto ${ri}${receipt.files.length > 1 ? ` (fil ${fi} av ${receipt.files.length})` : ""} · ${formatSek(receipt.amountOre)}${datum ? ` · ${datum}` : ""}${receipt.note ? ` · ${receipt.note}` : ""} · ${file.originalName}`;
      if (file.mimeType === "application/pdf") {
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(await readUpload(file.storedPath), { ignoreEncryption: true });
        } catch {
          const p = doc.addPage([A4.w, A4.h]);
          p.drawText(sanitize(`${caption}\n(PDF-filen kunde inte läsas)`, fonts.regular), { x: M, y: A4.h - M, size: 10, font: fonts.regular });
          continue;
        }
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p, idx) => {
          doc.addPage(p);
          const { width, height } = p.getSize();
          p.drawRectangle({ x: 0, y: height - 16, width, height: 16, color: rgb(1, 1, 1), opacity: 0.85 });
          p.drawText(sanitize(`${caption}${pages.length > 1 ? ` · sida ${idx + 1}/${pages.length}` : ""}`, fonts.regular), {
            x: 8,
            y: height - 12,
            size: 7,
            font: fonts.regular,
            color: GRAY,
          });
        });
      } else {
        const rel = file.previewPath ?? file.storedPath;
        let img: PDFImage;
        try {
          const data = await readUpload(rel);
          img = file.previewPath || file.mimeType === "image/jpeg" ? await doc.embedJpg(data) : await doc.embedPng(data);
        } catch {
          const p = doc.addPage([A4.w, A4.h]);
          p.drawText(sanitize(`${caption} (bilden kunde inte läsas)`, fonts.regular), { x: M, y: A4.h - M, size: 10, font: fonts.regular });
          continue;
        }
        const p = doc.addPage([A4.w, A4.h]);
        p.drawText(sanitize(caption, fonts.regular), { x: M, y: A4.h - M + 10, size: 9, font: fonts.regular, color: GRAY });
        const maxW = A4.w - 2 * M;
        const maxH = A4.h - 2 * M - 10;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        p.drawImage(img, { x: (A4.w - w) / 2, y: A4.h - M - 4 - h, width: w, height: h });
      }
    }
  }
}

/** Filnamn för blanketten, t.ex. "Utl 2026-007 2026-03-05 Fika kvinnodagen Josefin Andersson.pdf". */
export function pdfFilename(expense: ExpenseWithAll): string {
  const parts = [
    "Utl",
    formatNumber(expense.year, expense.number),
    formatDay(expense.purchaseDate),
    safeFilename(expense.title ?? "", 50),
    safeFilename(expense.payeeName ?? "", 40),
  ].filter(Boolean);
  return `${parts.join(" ")}.pdf`;
}

/** Genererar hela PDF:en (blankett + kvitton). */
export async function generateExpensePdf(expense: ExpenseWithAll, treasurer: Treasurer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Utlägg ${formatNumber(expense.year, expense.number)} – ${expense.title ?? ""}`);
  doc.setAuthor("Maskinteknologsektionen");
  doc.setCreator("Utläggssystemet");

  const fonts: Fonts = {
    regular: await doc.embedFont(await asset("fonts/Roboto-Regular.ttf"), { subset: true }),
    bold: await doc.embedFont(await asset("fonts/Roboto-Bold.ttf"), { subset: true }),
  };
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedJpg(await asset("maskinmarket.jpg"));
  } catch {
    logo = null;
  }

  await drawForm(doc, fonts, expense, treasurer, logo);
  await appendReceipts(doc, fonts, expense);
  return doc.save();
}

export type { PDFPage };
