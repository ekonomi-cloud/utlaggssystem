import "server-only";
import { prisma } from "@/lib/prisma";
import { STATUS, accountRetentionDays, draftRetentionDays, reminderDays } from "@/lib/config";
import { mailReminder, adminMail } from "@/lib/email";
import { deleteUpload } from "@/lib/storage";
import { formatNumber } from "@/lib/format";

// Återkommande jobb: påminnelser till kassörer, gallring av kontonummer och gamla utkast.
// Körs en gång per dygn av schemaläggaren (src/lib/scheduler.ts) eller manuellt från
// inställningssidan / POST /api/jobs.

export type JobReport = {
  remindersSent: number;
  accountsCleared: number;
  draftsDeleted: number;
  ranAt: Date;
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Skickar en påminnelse per kassör om utlägg som väntat länge på beslut eller utbetalning. */
export async function sendReminders(): Promise<number> {
  const limit = daysAgo(reminderDays());
  const waiting = await prisma.expense.findMany({
    where: {
      status: { in: [STATUS.INSKICKAD, STATUS.GODKAND] },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: limit } }],
    },
    include: { committeeRef: { select: { treasurerEmail: true } } },
  });

  // Bara de som passerat gränsen räknat från inskickat/godkänt (eller senaste påminnelse).
  const due = waiting.filter((e) => {
    const since = e.reminderSentAt ?? (e.status === STATUS.INSKICKAD ? e.submittedAt : e.approvedAt);
    return since !== null && since !== undefined && since < limit;
  });
  if (due.length === 0) return 0;

  const byRecipient = new Map<string, typeof due>();
  for (const e of due) {
    const to = e.committeeRef?.treasurerEmail?.trim() || adminMail();
    byRecipient.set(to, [...(byRecipient.get(to) ?? []), e]);
  }

  let sent = 0;
  for (const [to, list] of byRecipient) {
    try {
      await mailReminder(
        to,
        list.map((e) => ({
          id: e.id,
          numberLabel: formatNumber(e.year, e.number),
          title: e.title ?? "",
          payeeName: e.payeeName ?? "",
          totalOre: e.totalOre,
          status: e.status,
          since: (e.status === STATUS.INSKICKAD ? e.submittedAt : e.approvedAt) ?? e.createdAt,
        })),
      );
      await prisma.expense.updateMany({
        where: { id: { in: list.map((e) => e.id) } },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`Påminnelse till ${to} misslyckades:`, err);
    }
  }
  return sent;
}

/** Tar bort kontonummer från utbetalda/nekade utlägg som är äldre än gallringstiden. */
export async function clearOldAccountNumbers(): Promise<number> {
  const limit = daysAgo(accountRetentionDays());
  const old = await prisma.expense.findMany({
    where: {
      accountNumber: { not: null },
      OR: [
        { status: STATUS.UTBETALD, paidAt: { lt: limit } },
        { status: STATUS.NEKAD, rejectedAt: { lt: limit } },
      ],
    },
    select: { id: true },
  });
  for (const e of old) {
    await prisma.expense.update({
      where: { id: e.id },
      data: {
        accountNumber: null,
        accountDeletedAt: new Date(),
        events: { create: [{ type: "ACCOUNT_DELETED", actor: "system", message: `Kontonumret gallrades efter ${accountRetentionDays()} dagar.` }] },
      },
    });
  }
  return old.length;
}

/** Tar bort utkast som inte rörts på länge, inklusive uppladdade filer. */
export async function deleteStaleDrafts(): Promise<number> {
  const limit = daysAgo(draftRetentionDays());
  const drafts = await prisma.expense.findMany({
    where: { status: STATUS.UTKAST, updatedAt: { lt: limit } },
    include: { receipts: { include: { files: true } } },
  });
  for (const d of drafts) {
    for (const r of d.receipts) {
      for (const f of r.files) {
        await deleteUpload(f.storedPath);
        await deleteUpload(f.previewPath);
      }
    }
    await prisma.expense.delete({ where: { id: d.id } });
  }
  return drafts.length;
}

/** Kör alla dagliga jobb och antecknar tidpunkten. */
export async function runDailyJobs(): Promise<JobReport> {
  const remindersSent = await sendReminders();
  const accountsCleared = await clearOldAccountNumbers();
  const draftsDeleted = await deleteStaleDrafts();
  const ranAt = new Date();
  await prisma.settings.upsert({
    where: { id: "default" },
    update: { jobsLastRunAt: ranAt },
    create: { id: "default", jobsLastRunAt: ranAt },
  });
  console.log(`[jobb] påminnelser: ${remindersSent}, gallrade kontonummer: ${accountsCleared}, borttagna utkast: ${draftsDeleted}`);
  return { remindersSent, accountsCleared, draftsDeleted, ranAt };
}

/** Ska de dagliga jobben köras nu? En gång per dygn, tidigast kl 07. */
export async function dailyJobsDue(now = new Date()): Promise<boolean> {
  if (now.getHours() < 7) return false;
  const s = await prisma.settings.findUnique({ where: { id: "default" } });
  const last = s?.jobsLastRunAt;
  if (!last) return true;
  return last.toDateString() !== now.toDateString();
}
