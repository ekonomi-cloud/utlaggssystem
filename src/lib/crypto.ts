import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Kontonummer lagras krypterade (AES-256-GCM) med nyckeln ENCRYPTION_KEY.
// Format i databasen: "v1:<iv hex>:<tag hex>:<ciphertext hex>"

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY saknas eller är fel: ska vara 64 hex-tecken (openssl rand -hex 32)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(stored: string | null | undefined): string {
  if (!stored) return "";
  const [v, ivHex, tagHex, dataHex] = stored.split(":");
  if (v !== "v1" || !ivHex || !tagHex || !dataHex) return "";
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/** Visar bara de sista fyra siffrorna, t.ex. "•••• 1234". */
export function maskAccount(plain: string): string {
  const digits = plain.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}
