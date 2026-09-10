import "server-only";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// Uppladdade filer och genererade PDF:er lagras på disk.
// Sökvägar i databasen är relativa till respektive katalog.

export function uploadDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./data/uploads");
}

export function pdfDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.PDF_DIR || "./data/pdf");
}

function safeJoin(base: string, rel: string): string {
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep) && full !== base) {
    throw new Error("Ogiltig filsökväg");
  }
  return full;
}

export async function saveUpload(rel: string, data: Buffer): Promise<void> {
  const full = safeJoin(uploadDir(), rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readUpload(rel: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ safeJoin(uploadDir(), rel));
}

export async function deleteUpload(rel: string | null | undefined): Promise<void> {
  if (!rel) return;
  await rm(safeJoin(uploadDir(), rel), { force: true });
}

export async function savePdf(rel: string, data: Uint8Array): Promise<string> {
  const full = safeJoin(pdfDir(), rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return full;
}

export async function readPdf(rel: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ safeJoin(pdfDir(), rel));
}
