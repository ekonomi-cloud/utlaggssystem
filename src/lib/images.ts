import "server-only";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { PDFDocument } from "pdf-lib";

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf" | null;

/** Avgör filtyp från filens innehåll i stället för att lita på webbläsaren. */
export function sniffType(buf: Buffer): SniffedType {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis|avif)$/.test(brand)) return "image/heic";
  }
  return null;
}

export type ProcessedImage = {
  /** Normaliserad JPEG: roterad enligt EXIF, max 2000 px på långsidan. */
  preview: Buffer;
  width: number;
  height: number;
};

/** Konverterar HEIC vid behov, roterar rätt och skapar en JPEG-förhandsvisning. */
export async function processImage(buf: Buffer, type: SniffedType): Promise<ProcessedImage> {
  let input: Buffer = buf;
  if (type === "image/heic") {
    const out = await heicConvert({ buffer: new Uint8Array(buf), format: "JPEG", quality: 0.92 });
    input = Buffer.from(out);
  }
  const rotated = sharp(input).rotate();
  const meta = await rotated.metadata();
  const preview = await rotated
    .clone()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { preview, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Antal sidor i en PDF, eller null om filen inte kan läsas. */
export async function pdfPageCount(buf: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}
