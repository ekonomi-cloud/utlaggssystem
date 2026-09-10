/** Visar hur kvitto- och utläggsdatum är lagrade. Läser bara. */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { formatDay } from "../src/lib/format";

const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.expense.findMany({
    select: { year: true, number: true, title: true, purchaseDate: true, receipts: { select: { purchaseDate: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) {
    const kvitton = r.receipts.map((x) => (x.purchaseDate ? formatDay(x.purchaseDate) : "saknas")).join(", ");
    console.log(
      `${r.year}-${r.number} ${r.title ?? ""}`.padEnd(46),
      "| utlägg:", r.purchaseDate ? r.purchaseDate.toISOString() : "null",
      "| visas som:", formatDay(r.purchaseDate),
      "| kvitton:", kvitton || "(inga)",
    );
  }
  await prisma.$disconnect();
}
main();
