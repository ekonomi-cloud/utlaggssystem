/** Visar vad som finns i databasen. Läser bara, ändrar ingenting. */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const expenses = await prisma.expense.findMany({
    select: { year: true, number: true, title: true, status: true, committee: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const [users, committees, profiles, files] = await Promise.all([
    prisma.user.count(),
    prisma.committee.count(),
    prisma.treasurerProfile.count(),
    prisma.receiptFile.count(),
  ]);
  console.log(`Utlägg: ${expenses.length}`);
  for (const e of expenses) console.log(`  ${e.year}-${e.number} ${e.status} ${e.committee ?? ""} ${e.title ?? ""}`);
  console.log(`Användare: ${users} | Kommittéer: ${committees} | Kassörsprofiler: ${profiles} | Kvittofiler: ${files}`);
  await prisma.$disconnect();
}
main();
