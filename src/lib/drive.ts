import "server-only";
import { google } from "googleapis";
import { Readable } from "node:stream";

// Laddar upp blanketter till Google Drive (ekonomi@mtek.chalmers.se).
// Använder samma OAuth-klient som inloggningen plus en refresh-token som
// skaffas en gång med `npm run drive:auth`.

/** Samma refresh-token används till både Drive och mailen. */
function refreshToken(): string | undefined {
  return process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || undefined;
}

export function driveConfigured(): boolean {
  return Boolean(
    refreshToken() &&
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

function client() {
  const oauth = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  oauth.setCredentials({ refresh_token: refreshToken() });
  return google.drive({ version: "v3", auth: oauth });
}

export type DriveFile = { id: string; url: string };

/**
 * Laddar upp (eller ersätter) en PDF i Drive-mappen.
 * Om existingId anges skrivs den filen över så att länken förblir densamma.
 */
export async function uploadPdf(
  name: string,
  data: Uint8Array,
  existingId?: string | null,
  folderId?: string,
): Promise<DriveFile> {
  const drive = client();
  const parent = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const media = { mimeType: "application/pdf", body: Readable.from(Buffer.from(data)) };
  if (existingId) {
    const res = await drive.files.update({
      fileId: existingId,
      requestBody: { name },
      media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });
    return { id: res.data.id!, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view` };
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [parent], mimeType: "application/pdf" },
    media,
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return { id: res.data.id!, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view` };
}

/** Kontrollerar att mappen går att nå. Returnerar mappens namn. */
export async function checkFolder(): Promise<string> {
  const res = await client().files.get({
    fileId: process.env.GOOGLE_DRIVE_FOLDER_ID!,
    fields: "name",
    supportsAllDrives: true,
  });
  return res.data.name ?? "(okänt namn)";
}
