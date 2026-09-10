import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManage, getSessionUser } from "@/lib/dal";
import { generateExpensePdf, pdfFilename } from "@/lib/pdf";
import { readPdf } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/expenses/[id]/pdf
 * Den sparade blanketten (ägare eller ansvarig kassör). Med ?forhandsgranska=1 genererar
 * kassören en färsk PDF utan att spara den.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/expenses/[id]/pdf">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Inte inloggad", { status: 401 });
  const { id } = await ctx.params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { receipts: { include: { files: true }, orderBy: { position: "asc" } }, events: true, user: true },
  });
  if (!expense) return new NextResponse("Hittades inte", { status: 404 });
  const manager = canManage(user, expense);
  if (expense.userId !== user.id && !manager) return new NextResponse("Saknar behörighet", { status: 403 });

  const preview = new URL(req.url).searchParams.get("forhandsgranska") === "1";
  let bytes: Uint8Array;
  if (preview && manager) {
    const p = await prisma.treasurerProfile.findUnique({ where: { email: user.email } });
    bytes = await generateExpensePdf(expense, { name: p?.name ?? "", signatureData: null });
  } else if (expense.pdfPath) {
    bytes = new Uint8Array(await readPdf(expense.pdfPath));
  } else {
    return new NextResponse("Blanketten är inte genererad ännu", { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdfFilename(expense))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
