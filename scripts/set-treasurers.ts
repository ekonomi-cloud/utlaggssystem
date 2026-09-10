/**
 * Kopplar kommittéer till sina kassörer. Kör om den när en kassör byts ut.
 * Namnen sätts inte här: varje kassör fyller i sitt eget namn och sin signatur
 * under Inställningar när de loggar in första gången.
 *
 * Kör lokalt:     npx tsx scripts/set-treasurers.ts
 * Kör på servern: railway ssh "cd /app && npx tsx scripts/set-treasurers.ts"
 * Lägg till --dry för att bara se vad som skulle ändras.
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry");

/** Kommitténamn exakt som de heter i systemet -> kassörens inloggning. */
const TREASURERS: Record<string, string> = {
  "M-sex": "kassor.m-sex@mtek.chalmers.se",
  "Rustmästeriet": "kassor.rustmasteriet@mtek.chalmers.se",
  "M.A.K.": "kapitalix@mtek.chalmers.se",
  "MGK": "kassor.mgk@mtek.chalmers.se",
  "MISS": "kassor.miss@mtek.chalmers.se",
  "MnollK": "kassor.mnollk@mtek.chalmers.se",
  "MALT": "kassor.malt@mtek.chalmers.se",
  "eXPerimentverkstaden": "kassor.xp@mtek.chalmers.se",
};

async function main() {
  const all = await prisma.committee.findMany({ orderBy: { sortOrder: "asc" } });
  const byName = new Map(all.map((c) => [c.name, c]));

  const saknas = Object.keys(TREASURERS).filter((n) => !byName.has(n));
  if (saknas.length) {
    console.log("VARNING: hittade inte dessa kommitteer i databasen:", saknas.join(", "));
  }

  let andrade = 0;
  for (const [name, email] of Object.entries(TREASURERS)) {
    const c = byName.get(name);
    if (!c) continue;
    if (c.treasurerEmail === email) continue;
    console.log(`  ${name}: ${c.treasurerEmail ?? "(sektionskassoren)"} -> ${email}`);
    if (!dryRun) await prisma.committee.update({ where: { id: c.id }, data: { treasurerEmail: email } });
    andrade++;
  }

  const utan = all.filter((c) => !TREASURERS[c.name]).map((c) => c.name);
  console.log(`\nHanteras av sektionskassoren (${utan.length} st): ${utan.join(", ")}`);
  console.log(dryRun ? `\n${andrade} skulle andras. Inget sparat (--dry).` : `\n${andrade} kommitteer uppdaterade.`);
  await prisma.$disconnect();
}

main();
