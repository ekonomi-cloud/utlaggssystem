import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Enkel hälsokontroll för driftövervakning (Docker HEALTHCHECK, Portainer,
 * lastbalanserare). Svarar 200 när appen kan nå databasen, annars 503.
 * Läcker ingenting: inga uppgifter om utlägg eller användare.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] databasen svarar inte:", err);
    return NextResponse.json(
      { status: "error", reason: "databasen svarar inte" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
