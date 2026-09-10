/**
 * Självtest av hela kedjan: bildbehandling, PDF-generering, Drive-uppladdning
 * och (frivilligt) mailutskick. Skapar ett testutlägg, kontrollerar varje steg
 * och tar sedan bort allt igen, både i databasen, på disken och i Drive.
 *
 * Kör lokalt:      npx tsx --conditions react-server scripts/smoke-test.ts
 * Kör på servern:  railway ssh "cd /app && npx tsx --conditions react-server scripts/smoke-test.ts"
 * Med mailutskick: lägg till --mail
 *
 * Säkert att köra i produktion: allt som skapas tas bort igen.
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { encrypt } from "../src/lib/crypto";
import { processImage, sniffType } from "../src/lib/images";
import { saveUpload, deleteUpload, savePdf } from "../src/lib/storage";
import { generateExpensePdf, pdfFilename } from "../src/lib/pdf";
import { driveConfigured, uploadPdf } from "../src/lib/drive";
import { mailTransport, transportLabel, sendMail, adminMail } from "../src/lib/email";
import { google } from "googleapis";

const prisma = new PrismaClient();
const withMail = process.argv.includes("--mail");
const results: { steg: string; utfall: string }[] = [];
let expenseId: string | null = null;
let driveFileId: string | null = null;
const uploaded: string[] = [];

function ok(steg: string, detalj = "") {
  results.push({ steg, utfall: "OK" + (detalj ? ` – ${detalj}` : "") });
}
function fail(steg: string, e: unknown) {
  results.push({ steg, utfall: "MISSLYCKADES – " + (e instanceof Error ? e.message : String(e)) });
}

async function receiptJpeg(): Promise<Buffer> {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='1200'>
    <rect width='100%' height='100%' fill='#fdfdf8'/>
    <text x='450' y='140' font-family='monospace' font-size='42' text-anchor='middle'>SJALVTEST BUTIK</text>
    <text x='450' y='210' font-family='monospace' font-size='28' text-anchor='middle'>${new Date().toISOString().slice(0, 10)}</text>
    <text x='90' y='400' font-family='monospace' font-size='32'>Testvara            1 x 12,34</text>
    <text x='90' y='520' font-family='monospace' font-size='36' font-weight='bold'>TOTALT              12,34 SEK</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function run() {
  console.log(`Miljö: ${process.env.AUTH_URL ?? "(ingen AUTH_URL)"}`);
  console.log(`Mailväg: ${transportLabel()}\n`);

  // 1. Databasen
  const user = await prisma.user.upsert({
    where: { email: "sjalvtest@mtek.chalmers.se" },
    update: {},
    create: { email: "sjalvtest@mtek.chalmers.se", name: "Självtest", emailVerified: new Date() },
  });
  const expense = await prisma.expense.create({
    data: {
      userId: user.id,
      status: "GODKAND",
      year: 1900,
      number: Math.floor(Math.random() * 100000),
      committee: "Självtest",
      title: "Självtest av utläggssystemet",
      description: "Skapat automatiskt för att kontrollera att PDF och Drive fungerar. Tas bort direkt.",
      purchaseDate: new Date(),
      totalOre: 1234,
      payeeName: "Självtest Testsson",
      payeeEmail: adminMail(),
      bankName: "Swedbank",
      clearing: "83271",
      accountNumber: encrypt("1234567890"),
      signatureData: await signature(),
      signedAt: new Date(),
      submittedAt: new Date(),
      approvedAt: new Date(),
    },
  });
  expenseId = expense.id;
  ok("Databasen", "utlägg skapat");

  // 2. Bildbehandling (sharp i behållaren)
  const jpeg = await receiptJpeg();
  const type = sniffType(jpeg);
  const img = await processImage(jpeg, type);
  ok("Bildbehandling", `${img.width}x${img.height} px`);

  const receipt = await prisma.receipt.create({
    data: {
      expenseId: expense.id,
      position: 0,
      amountOre: 1234,
      purchaseDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())),
      note: "Självtest",
    },
  });
  const file = await prisma.receiptFile.create({
    data: { receiptId: receipt.id, originalName: "sjalvtest.jpg", mimeType: "image/jpeg", size: jpeg.length, storedPath: "pending" },
  });
  const base = `${expense.id}/${file.id}`;
  await saveUpload(`${base}.jpg`, jpeg);
  await saveUpload(`${base}.preview.jpg`, img.preview);
  uploaded.push(`${base}.jpg`, `${base}.preview.jpg`);
  await prisma.receiptFile.update({
    where: { id: file.id },
    data: { storedPath: `${base}.jpg`, previewPath: `${base}.preview.jpg`, width: img.width, height: img.height },
  });
  ok("Filer på disk", "sparade på volymen");

  // 3. PDF (typsnitt + logga i behållaren)
  const full = await prisma.expense.findUniqueOrThrow({
    where: { id: expense.id },
    include: { receipts: { include: { files: true }, orderBy: { position: "asc" } }, events: true, user: true },
  });
  const pdf = await generateExpensePdf(full, { name: "Självtest Kassör", signatureData: await signature() });
  if (pdf.length < 5000) throw new Error("PDF:en blev misstänkt liten: " + pdf.length + " byte");
  await savePdf(`sjalvtest/${expense.id}.pdf`, pdf);
  ok("PDF-generering", `${Math.round(pdf.length / 1024)} kB, filnamn: ${pdfFilename(full)}`);

  // 4. Drive
  if (driveConfigured()) {
    const f = await uploadPdf("SJALVTEST tas bort automatiskt.pdf", pdf, null);
    driveFileId = f.id;
    ok("Google Drive", "uppladdad och verifierad");
  } else {
    results.push({ steg: "Google Drive", utfall: "HOPPADES ÖVER – inte konfigurerad" });
  }

  // 5. Mail
  if (withMail) {
    await sendMail({
      to: adminMail(),
      subject: "Självtest av utläggssystemet",
      text: "Det här mailet skickades av självtestet. Bilagan är en genererad testblankett.",
      attachments: [{ filename: "sjalvtest.pdf", content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    ok("Mailutskick", `skickat till ${adminMail()} via ${mailTransport()}`);
  } else {
    results.push({ steg: "Mailutskick", utfall: "HOPPADES ÖVER – kör med --mail för att testa" });
  }
}

async function signature(): Promise<string> {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200'><path d='M20 140 C 80 20, 140 20, 180 120 S 260 200, 320 90 S 420 10, 480 120 S 560 170, 580 100' stroke='#1a1a1a' stroke-width='5' fill='none' stroke-linecap='round'/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function cleanup() {
  for (const rel of uploaded) await deleteUpload(rel).catch(() => {});
  if (expenseId) {
    await prisma.expense.delete({ where: { id: expenseId } }).catch(() => {});
    const { rm } = await import("node:fs/promises");
    const path = await import("node:path");
    await rm(path.resolve(process.env.PDF_DIR || "./data/pdf", "sjalvtest"), { recursive: true, force: true }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: "sjalvtest@mtek.chalmers.se" } }).catch(() => {});
  if (driveFileId) {
    try {
      const oauth = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
      oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
      await google.drive({ version: "v3", auth: oauth }).files.delete({ fileId: driveFileId, supportsAllDrives: true });
      console.log("Testfilen i Drive borttagen.");
    } catch (e) {
      console.log("OBS: testfilen i Drive kunde inte tas bort:", e instanceof Error ? e.message : e);
    }
  }
}

async function main() {
  try {
    await run();
  } catch (e) {
    fail("Avbröts", e);
  } finally {
    await cleanup();
    console.log("\nResultat:");
    for (const r of results) {
      const tecken = r.utfall.startsWith("OK") ? "OK  " : r.utfall.startsWith("HOPP") ? "--  " : "FEL ";
      console.log(`  ${tecken}${r.steg}: ${r.utfall}`);
    }
    const failed = results.filter((r) => r.utfall.startsWith("MISSLYCKADES"));
    console.log(failed.length === 0 ? "\nALLT FUNGERAR. Stadat efter sig." : `\n${failed.length} STEG MISSLYCKADES.`);
    await prisma.$disconnect();
    process.exit(failed.length === 0 ? 0 : 1);
  }
}

main();
