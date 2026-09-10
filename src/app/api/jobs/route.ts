import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * POST /api/jobs  (header: Authorization: Bearer <JOBS_SECRET>)
 * Kör de dagliga jobben. Används av en extern schemaläggare om appen inte
 * kör som en långlivad process. Annars sköter src/lib/scheduler.ts detta.
 */
export async function POST(req: Request) {
  const secret = process.env.JOBS_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Saknar behörighet" }, { status: 401 });
  }
  const report = await runDailyJobs();
  return NextResponse.json(report);
}
