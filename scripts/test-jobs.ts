/**
 * Lokalt test av de dagliga jobben: backdaterar testutlägg och kör jobben.
 * Kör: npx tsx --conditions react-server scripts/test-jobs.ts
 * Använd INTE i produktion.
 */
import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";
import { runDailyJobs } from "../src/lib/jobs";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // Inskickade utlägg får se ut att ha väntat 10 dagar, utbetalda 100 dagar.
  const waiting = await prisma.expense.updateMany({
    where: { status: "INSKICKAD" },
    data: { submittedAt: daysAgo(10), reminderSentAt: null },
  });
  const approved = await prisma.expense.updateMany({
    where: { status: "GODKAND" },
    data: { approvedAt: daysAgo(10), reminderSentAt: null },
  });
  const paid = await prisma.expense.updateMany({
    where: { status: "UTBETALD" },
    data: { paidAt: daysAgo(100) },
  });
  console.log(`Backdaterade ${waiting.count} inskickade, ${approved.count} godkända och ${paid.count} utbetalda utlägg.`);
  const all = await prisma.expense.findMany({ select: { year: true, number: true, status: true, committee: true } });
  console.table(all);

  const report = await runDailyJobs();
  console.log(report);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
