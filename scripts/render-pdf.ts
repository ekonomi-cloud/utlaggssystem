/**
 * Genererar blankett-PDF:en för ett utlägg till en fil, utan att röra databasen.
 * Kör: npx tsx --conditions react-server scripts/render-pdf.ts <utläggs-id> <utfil.pdf>
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { generateExpensePdf } from "../src/lib/pdf";

async function main() {
  const prisma = new PrismaClient();
  const [id, out] = process.argv.slice(2);
  if (!id || !out) {
    console.error("Användning: tsx --conditions react-server scripts/render-pdf.ts <id> <utfil.pdf>");
    process.exit(1);
  }
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id },
    include: { receipts: { include: { files: true }, orderBy: { position: "asc" } }, events: true, user: true },
  });
  const email = expense.approvedBy ?? (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  const profile = email ? await prisma.treasurerProfile.findUnique({ where: { email } }) : null;
  const bytes = await generateExpensePdf(expense, {
    name: profile?.name ?? "",
    signatureData: profile?.signatureData ?? null,
  });
  await writeFile(out, bytes);
  console.log(`Skrev ${out} (${bytes.length} byte)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
