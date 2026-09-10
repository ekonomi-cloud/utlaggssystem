/**
 * Skapar testdata lokalt: ett inskickat utlägg med två kvitton för en testanvändare.
 * Kör: npx tsx scripts/seed-test.ts
 * Använd INTE i produktion.
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function receiptImage(title: string, total: string): Promise<Buffer> {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='1200'>
  <rect width='100%' height='100%' fill='#fdfdf8'/>
  <text x='450' y='120' font-family='monospace' font-size='44' text-anchor='middle'>${title}</text>
  <text x='450' y='180' font-family='monospace' font-size='28' text-anchor='middle'>2026-02-10  17:05</text>
  <text x='80' y='320' font-family='monospace' font-size='30'>Pizza Capricciosa   4 x 119,00</text>
  <text x='80' y='370' font-family='monospace' font-size='30'>Läsk 1,5 l          3 x 24,90</text>
  <text x='80' y='480' font-family='monospace' font-size='36' font-weight='bold'>TOTALT              ${total} SEK</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "tora.test@student.chalmers.se" },
    update: {},
    create: { email: "tora.test@student.chalmers.se", name: "Tora Testsson", emailVerified: new Date() },
  });

  const committee = await prisma.committee.findFirst({ where: { name: "M-ord" } });
  const expense = await prisma.expense.create({
    data: {
      userId: user.id,
      status: "INSKICKAD",
      committeeId: committee?.id ?? null,
      committee: committee?.name ?? "Annan: M-ord",
      title: "Skrivarkväll M-ord, pizza",
      description: "Pizza och läsk till redaktionens skrivarkväll inför tidningssläppet, 9 deltagare.",
      purchaseDate: new Date(Date.UTC(2026, 1, 10)),
      totalOre: 55070,
      payeeName: "Tora Testsson",
      payeeEmail: "tora.test@student.chalmers.se",
      bankName: "Nordea",
      clearing: "3300",
      accountNumber: encrypt("9001011234"),
      signatureData: await makeSignature(),
      signedAt: new Date(),
      submittedAt: new Date(),
      events: { create: [{ type: "CREATED", actor: user.email }, { type: "SUBMITTED", actor: user.email }] },
    },
  });

  const last = await prisma.expense.findFirst({ where: { year: 2026 }, orderBy: { number: "desc" } });
  await prisma.expense.update({ where: { id: expense.id }, data: { year: 2026, number: (last?.number ?? 0) + 1 } });

  const dir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads", expense.id);
  await mkdir(dir, { recursive: true });

  const items = [
    { amountOre: 47600, note: "Pizzeria", title: "PIZZERIA CAMPUS", total: "476,00" },
    { amountOre: 7470, note: "Läsk, ICA", title: "ICA NÄRA JOHANNEBERG", total: "74,70" },
  ];
  let pos = 0;
  for (const it of items) {
    const receipt = await prisma.receipt.create({
      data: {
        expenseId: expense.id,
        position: pos++,
        amountOre: it.amountOre,
        purchaseDate: new Date(Date.UTC(2026, 1, 10)),
        note: it.note,
      },
    });
    const file = await prisma.receiptFile.create({
      data: { receiptId: receipt.id, originalName: `${it.title.toLowerCase().replace(/\s+/g, "-")}.jpg`, mimeType: "image/jpeg", size: 0, storedPath: "pending" },
    });
    const img = await receiptImage(it.title, it.total);
    const rel = `${expense.id}/${file.id}`;
    await writeFile(path.join(dir, `${file.id}.jpg`), img);
    await writeFile(path.join(dir, `${file.id}.preview.jpg`), img);
    await prisma.receiptFile.update({
      where: { id: file.id },
      data: { size: img.length, storedPath: `${rel}.jpg`, previewPath: `${rel}.preview.jpg`, width: 900, height: 1200 },
    });
  }
  console.log("Skapade testutlägg", expense.id);
}

/** En enkel "namnteckning" som PNG data-URL (ritad med sharp från SVG). */
async function makeSignature(): Promise<string> {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200'><path d='M20 140 C 80 20, 140 20, 180 120 S 260 200, 320 90 S 420 10, 480 120 S 560 170, 580 100' stroke='#1a1a1a' stroke-width='5' fill='none' stroke-linecap='round'/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
