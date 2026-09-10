import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/dal";
import { EDITABLE_STATUSES, MAX_FILE_BYTES, MAX_FILES_PER_RECEIPT, MIN_IMAGE_LONG_SIDE, type Status } from "@/lib/config";
import { sniffType, processImage, pdfPageCount } from "@/lib/images";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * POST multipart/form-data: receiptId, file
 * Sparar ett kvitto (bild eller PDF) kopplat till ett kvitto-delbelopp.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });

  const form = await req.formData();
  const receiptId = String(form.get("receiptId") ?? "");
  const file = form.get("file");
  if (!receiptId || !(file instanceof File)) {
    return NextResponse.json({ error: "Fil saknas" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `Filen är för stor (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 400 });
  }

  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: { expense: true, files: true },
  });
  if (!receipt || receipt.expense.userId !== user.id) {
    return NextResponse.json({ error: "Kvittot hittades inte" }, { status: 404 });
  }
  if (!EDITABLE_STATUSES.includes(receipt.expense.status as Status)) {
    return NextResponse.json({ error: "Utlägget kan inte längre ändras" }, { status: 409 });
  }
  if (receipt.files.length >= MAX_FILES_PER_RECEIPT) {
    return NextResponse.json({ error: `Max ${MAX_FILES_PER_RECEIPT} filer per kvitto` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type) {
    return NextResponse.json(
      { error: "Filtypen stöds inte. Ladda upp JPG, PNG, HEIC eller PDF." },
      { status: 400 },
    );
  }

  const record = await prisma.receiptFile.create({
    data: {
      receiptId,
      originalName: file.name.slice(0, 200),
      mimeType: type,
      size: buf.length,
      storedPath: "pending",
    },
  });

  const base = `${receipt.expenseId}/${record.id}`;
  const storedPath = `${base}.${EXT[type]}`;
  let previewPath: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let pageCount: number | null = null;

  try {
    await saveUpload(storedPath, buf);
    if (type === "application/pdf") {
      pageCount = await pdfPageCount(buf);
      if (pageCount === null) throw new Error("PDF-filen gick inte att läsa. Är den lösenordsskyddad eller skadad?");
    } else {
      const img = await processImage(buf, type);
      previewPath = `${base}.preview.jpg`;
      await saveUpload(previewPath, img.preview);
      width = img.width;
      height = img.height;
    }
  } catch (e) {
    await prisma.receiptFile.delete({ where: { id: record.id } }).catch(() => {});
    const msg = e instanceof Error ? e.message : "Filen kunde inte behandlas";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const updated = await prisma.receiptFile.update({
    where: { id: record.id },
    data: { storedPath, previewPath, width, height, pageCount },
  });

  const longSide = Math.max(width ?? 0, height ?? 0);
  const lowResolution = type !== "application/pdf" && longSide > 0 && longSide < MIN_IMAGE_LONG_SIDE;

  return NextResponse.json({
    id: updated.id,
    originalName: updated.originalName,
    mimeType: updated.mimeType,
    size: updated.size,
    pageCount: updated.pageCount,
    previewUrl: previewPath ? `/api/files/${updated.id}?v=preview` : null,
    lowResolution,
  });
}
