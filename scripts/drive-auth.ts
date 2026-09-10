/**
 * Engångsskript för att hämta en refresh-token till Google Drive och Gmail.
 *
 * Kör: npm run drive:auth
 * Logga in som ekonomi@mtek.chalmers.se i webbläsaren som öppnas.
 * Klistra sedan in GOOGLE_REFRESH_TOKEN i .env. Nyckeln används både för att
 * spara blanketter i Drive och för att skicka mailen.
 *
 * Kräver att AUTH_GOOGLE_ID och AUTH_GOOGLE_SECRET finns i .env och att
 * http://localhost:3456/oauth2callback är tillagd som redirect-URI i Google Cloud Console.
 */
import { config } from "dotenv";
import http from "node:http";
import { google } from "googleapis";

config();

const clientId = process.env.AUTH_GOOGLE_ID;
const clientSecret = process.env.AUTH_GOOGLE_SECRET;
if (!clientId || !clientSecret) {
  console.error("AUTH_GOOGLE_ID och AUTH_GOOGLE_SECRET måste finnas i .env");
  process.exit(1);
}

/**
 * Med --mail hamtas i stallet en nyckel som bara far skicka mail. Logga da in som
 * utlagg@mtek.chalmers.se, sa skickas alla utskick fran botkontot.
 */
const mailOnly = process.argv.includes("--mail");
const redirect = "http://localhost:3456/oauth2callback";
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirect);
const url = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: mailOnly
    ? ["https://www.googleapis.com/auth/gmail.send"]
    : [
        // Full Drive-behörighet krävs för att lägga filer i mappar som skapats för hand
        // (t.ex. kommittéernas egna mappar). Den smalare drive.file ger bara tillgång
        // till filer appen själv skapat.
        "https://www.googleapis.com/auth/drive",
        // Skickar mailen via Googles API i stället för SMTP, som blockeras av många
        // molnplattformar (bl.a. Railway).
        "https://www.googleapis.com/auth/gmail.send",
      ],
  // Appen är intern, så Google kräver ingen verifiering för de här behörigheterna.
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", redirect);
  if (u.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Kod saknas");
    return;
  }
  try {
    const { tokens } = await oauth.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>Klart! Gå tillbaka till terminalen.</h2>");
    console.log("\nLägg in detta i .env:\n");
    const namn = mailOnly ? "MAIL_GOOGLE_REFRESH_TOKEN" : "GOOGLE_REFRESH_TOKEN";
    console.log(`${namn}="${tokens.refresh_token}"\n`);
  } catch (e) {
    res.writeHead(500).end("Fel: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    server.close();
  }
});

server.listen(3456, () => {
  console.log("Öppna den här adressen i webbläsaren och logga in som ekonomi@mtek.chalmers.se:\n");
  console.log(url + "\n");
});
