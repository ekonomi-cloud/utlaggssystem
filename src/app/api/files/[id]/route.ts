import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/dal";
import { EDITABLE_STATUSES, type Status } from "@/lib/config";
import { readUpload, deleteUpload } from "@/lib/storage";

export const runtime = "nodejs";

async function loadFile(id: string) {
  return prisma.receiptFile.findUnique({
    where: { id },
    include: { receipt: { include: { expense: { select: { id: true, userId: true, status: true } } } } },
  });
}

/** GET /api/files/[id]?v=preview|original — kvittofil, bara för ägaren eller kassören. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Inte inloggad", { status: 401 });
  const { id } = await ctx.params;
  const file = await loadFile(id);
  if (!file) return new NextResponse("Hittades inte", { status: 404 });
  if (file.receipt.expense.userId !== user.id && !user.isAdmin) {
    return new NextResponse("Saknar behörighet", { status: 403 });
  }

  const url = new URL(req.url);
  const wantPreview = url.searchParams.get("v") === "preview" && file.previewPath;
  const rel = wantPreview ? file.previewPath! : file.storedPath;
  const data = await readUpload(rel);
  const type = wantPreview ? "image/jpeg" : file.mimeType;
  const inline = type.startsWith("image/") || type === "application/pdf";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** DELETE /api/files/[id] — tar bort en uppladdad fil från ett redigerbart utlägg. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await loadFile(id);
  if (!file) return NextResponse.json({ ok: true });
  if (file.receipt.expense.userId !== user.id) {
    return NextResponse.json({ error: "Saknar behörighet" }, { status: 403 });
  }
  if (!EDITABLE_STATUSES.includes(file.receipt.expense.status as Status)) {
    return NextResponse.json({ error: "Utlägget kan inte längre ändras" }, { status: 409 });
  }
  await prisma.receiptFile.delete({ where: { id } });
  await deleteUpload(file.storedPath);
  await deleteUpload(file.previewPath);
  return NextResponse.json({ ok: true });
}
