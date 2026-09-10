/**
 * Numrerar om kommittélistan: M-Styret först, resten i svensk bokstavsordning.
 * Kör om den när nya kommittéer lagts till och listan hamnat i oordning.
 *
 * Kör lokalt:     npx tsx scripts/sort-committees.ts
 * Kör på servern: railway ssh "cd /app && npx tsx scripts/sort-committees.ts"
 * Lägg till --dry för att bara se resultatet utan att spara.
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry");

/** Kommittén som alltid ska ligga överst, oavsett bokstavsordning. */
const FIRST = "M-Styret";

async function main() {
  const committees = await prisma.committee.findMany();
  if (committees.length === 0) {
    console.log("Inga kommitteer att sortera.");
    return;
  }

  // Svensk sortering: a-o-z, sedan a-ring, a-prickar, o-prickar. Bindestreck och
  // punkter raknas inte, sa M-ord hamnar bland Mn och Mp och inte fore MALT.
  const collator = new Intl.Collator("sv", { ignorePunctuation: true, sensitivity: "base" });

  const first = committees.filter((c) => c.name === FIRST);
  const rest = committees.filter((c) => c.name !== FIRST).sort((a, b) => collator.compare(a.name, b.name));
  const ordered = [...first, ...rest];

  console.log(dryRun ? "Sa har skulle listan bli:" : "Ny ordning:");
  let order = 10;
  for (const c of ordered) {
    console.log(`  ${String(order).padStart(4)}  ${c.name}`);
    if (!dryRun && c.sortOrder !== order) {
      await prisma.committee.update({ where: { id: c.id }, data: { sortOrder: order } });
    }
    order += 10;
  }
  console.log(dryRun ? "\nInget sparat (--dry)." : `\n${ordered.length} kommitteer numrerade om.`);
  await prisma.$disconnect();
}

main();
