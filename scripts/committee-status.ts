/** Visar kommittélistan och kassörsprofilerna. Läser bara, ändrar ingenting. */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const cs = await prisma.committee.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { expenses: true } } },
  });
  console.log(`Kommitteer: ${cs.length}`);
  for (const c of cs) {
    const kassor = c.treasurerEmail ? `${c.treasurerName ?? ""} <${c.treasurerEmail}>` : "sektionskassoren";
    const mapp = c.driveFolderId ? " | egen Drive-mapp" : "";
    console.log(`  ${String(c.sortOrder).padStart(4)}  ${c.active ? "aktiv " : "dold  "} ${c.name}  ->  ${kassor}${mapp}`);
  }
  const ps = await prisma.treasurerProfile.findMany();
  console.log(`\nKassorsprofiler: ${ps.length}`);
  for (const p of ps) console.log(`  ${p.name} <${p.email}> | signatur: ${p.signatureData ? "ja" : "SAKNAS"}`);
  await prisma.$disconnect();
}
main();
