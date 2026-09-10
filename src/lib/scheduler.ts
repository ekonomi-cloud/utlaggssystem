import "server-only";

// Enkel schemaläggare som körs inne i serverprocessen (startas från src/instrumentation.ts).
// Var 30:e minut kontrolleras om de dagliga jobben ska köras. Kräver ingen extern cron.
// Kör man appen på en plattform utan långlivad process kan POST /api/jobs anropas
// från en extern schemaläggare i stället (med JOBS_SECRET).

const globalForScheduler = globalThis as unknown as { schedulerStarted?: boolean };

export function startScheduler(): void {
  if (globalForScheduler.schedulerStarted) return;
  globalForScheduler.schedulerStarted = true;
  if (process.env.DISABLE_SCHEDULER === "1") return;

  const tick = async () => {
    try {
      const { dailyJobsDue, runDailyJobs } = await import("@/lib/jobs");
      if (await dailyJobsDue()) await runDailyJobs();
    } catch (err) {
      console.error("[jobb] misslyckades:", err);
    }
  };
  // Första kontrollen strax efter start, sedan var 30:e minut.
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 30 * 60_000).unref();
}
