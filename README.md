# Utläggssystemet – Maskinteknologsektionen

Webbapp där sektionens medlemmar gör utlägg digitalt och kassörerna granskar, godkänner och
betalar ut. Ersätter PDF-blanketten och mailen till utlagg@mtek.chalmers.se.

## Vad systemet gör

**För utläggaren**

- Loggar in med Google-konto.
- Väljer vilken kommitté eller förening utlägget gäller och fyller i samma uppgifter som på
  utläggsblanketten, i fyra steg med hjälptexter och validering (datum som ÅÅÅÅ-MM-DD,
  clearingnummer som slås upp mot bank, kontonummer bara siffror osv).
- Laddar upp ett eller flera kvitton (JPG, PNG, HEIC eller PDF). Varje kvitto har eget belopp
  och eget datum, så inköp från olika dagar kan ligga på samma utlägg. Totalsumman räknas ut
  automatiskt och de valda datumen listas. Bilder med låg upplösning får en varning.
- Datum skrivs som ÅÅÅÅ-MM-DD och kontrolleras direkt när de fyllts i, inte först vid inskick.
  Kalenderknappen öppnar mobilens egen datumväljare.
- Intygar attesttexten och signerar i en signaturruta (med ångra-knapp). Signaturen beskärs till
  själva namnteckningen, så att den inte sparas som en mestadels tom bild. Har man gjort utlägg
  förut erbjuds den sparade signaturen med förhandsgranskning, som ett aktivt val.
- Får mail när utlägget skickas in, godkänns, betalas ut, nekas eller behöver kompletteras.
- Kontouppgifterna sparas krypterat och förifylls nästa gång. Kan tas bort av användaren själv.

**För kassörerna** (`/admin`)

- **Sektionskassören** (adress i `ADMIN_EMAILS`) ser alla utlägg, hanterar kommittélistan,
  kopplingar och automatik.
- **Kommittékassörer** registreras per kommitté under *Kassör → Kommittéer*. De loggar in med
  sin e-post och ser bara sin kommittés utlägg. Utlägg för ”Annan förening” hanteras av
  sektionskassören.
- Notiser om nya utlägg går till kommitténs kassör. Utläggarens mail får kassörens adress som
  svarsadress.
- Lista med flikar per status, kommittéfilter, sök, summor och hur länge varje utlägg väntat.
- Detaljvy med kvitton, signatur, kontouppgifter och händelselogg.
- Godkänn, begär komplettering (utläggaren kan ändra och skicka in igen), neka, markera som utbetald.
- Vid godkännande genereras en PDF med den ifyllda blanketten, utläggarens signatur, den
  godkännande kassörens namn och signatur samt alla kvitton som efterföljande sidor. Kommer
  kvittona från olika dagar visas spannet som köpdatum och varje kvitto listas med sitt eget datum. PDF:en sparas
  på servern, laddas upp till Google Drive (kommitténs egen mapp om en sådan angetts, annars
  standardmappen) och mailas till utläggaren. Vid ”Markera som utbetald” görs PDF:en om med
  utbetalningsdatum och ersätter filen i Drive.
- Varje kassör lägger in sitt namn och sin signatur under *Kassör → Inställningar*.

**Automatik** (körs en gång per dygn inne i servern, se `src/lib/scheduler.ts`)

- Påminnelse med mail till ansvarig kassör om utlägg som väntat `REMINDER_DAYS` dagar (standard 7)
  på beslut eller utbetalning. Upprepas lika ofta tills utlägget är klart.
- Kontonummer gallras ur databasen `ACCOUNT_RETENTION_DAYS` dagar (standard 90) efter
  utbetalning eller nekande. Blanketten i Drive påverkas inte.
- Utkast som inte rörts på `DRAFT_RETENTION_DAYS` dagar (standard 60) tas bort.
- Sektionskassören kan köra jobben manuellt under *Inställningar → Kör nu*. Kör man appen på en
  plattform utan långlivad process kan en extern schemaläggare anropa `POST /api/jobs` med
  `Authorization: Bearer <JOBS_SECRET>` i stället.

## Teknik

- [Next.js 16](https://nextjs.org) (App Router, React 19, TypeScript)
- [Prisma](https://prisma.io) med SQLite (kan bytas till Postgres, se nedan)
- [Auth.js](https://authjs.dev) med Google-inloggning
- [pdf-lib](https://pdf-lib.js.org) för PDF, [sharp](https://sharp.pixelplumbing.com) och
  heic-convert för bilder, [signature_pad](https://github.com/szimek/signature_pad) för signaturer
- googleapis för Drive och för mailutskick via Googles mail-API, nodemailer för att
  bygga meddelandena (och som SMTP-reserv)

Stilen följer mtek.chalmers.se: Roboto, bruna färgerna `#4E342E`/`#795548`, bärnstensgult `#CB800B`.

## Kom igång lokalt

Kräver Node.js 20 eller senare.

```bash
npm install
cp .env.example .env
```

Fyll i `.env`:

```bash
# Generera hemligheter
openssl rand -base64 32   # -> AUTH_SECRET
openssl rand -hex 32      # -> ENCRYPTION_KEY
```

Skapa databasen och starta:

```bash
npx prisma migrate deploy
npm run dev
```

Öppna http://localhost:3000. Utan Google-nycklar i `.env` visas en **utvecklarinloggning** där
du loggar in med valfri e-postadress. Logga in med adressen i `ADMIN_EMAILS` för att komma åt
kassörsvyn. Mail skickas inte utan SMTP, utan sparas som filer i `data/outbox/`. Kommittélistan
fylls automatiskt med standardlistan från `src/lib/config.ts` första gången formuläret öppnas.

Testdata: `npx tsx scripts/seed-test.ts` skapar ett inskickat utlägg med två kvitton.
`npx tsx --conditions react-server scripts/test-jobs.ts` backdaterar testutlägg och kör de dagliga
jobben.

## Konfiguration steg för steg

### 1. Google-inloggning (obligatoriskt i produktion)

1. Gå till [Google Cloud Console](https://console.cloud.google.com/), skapa ett projekt
   (t.ex. "Utläggssystem") inloggad som ekonomi@mtek.chalmers.se.
2. *APIs & Services → OAuth consent screen*: välj **External**, fyll i appnamn och kontaktmail.
   Publicera appen (annars fungerar bara testanvändare).
3. *APIs & Services → Credentials → Create credentials → OAuth client ID*, typ **Web application**.
   - Authorized JavaScript origins: `https://utlagg.mtek.chalmers.se` (och `http://localhost:3000`)
   - Authorized redirect URIs: `https://utlagg.mtek.chalmers.se/api/auth/callback/google`
     (och `http://localhost:3000/api/auth/callback/google`, samt
     `http://localhost:3456/oauth2callback` för Drive-skriptet nedan)
4. Lägg in Client ID och Client secret som `AUTH_GOOGLE_ID` och `AUTH_GOOGLE_SECRET`.
5. Sätt `AUTH_URL` till appens fulla adress.

### 2. Google Drive

1. Aktivera **Google Drive API** i samma Cloud-projekt (*APIs & Services → Library*).
2. Skapa en mapp i ekonomi@:s Drive, t.ex. "Utlägg". Kopiera mappens ID från adressfältet
   (`https://drive.google.com/drive/folders/<ID>`) till `GOOGLE_DRIVE_FOLDER_ID`.
3. Kör `npm run drive:auth` lokalt, öppna länken, logga in som ekonomi@mtek.chalmers.se och
   godkänn. Klistra in den utskrivna `GOOGLE_REFRESH_TOKEN` i `.env`. Nyckeln ger tillgång
   till både Drive och mailutskicken.
4. Testa under *Kassör → Inställningar → Kopplingar*.

Filerna sparas som `Utl <nr> <köpdatum> <titel> <namn>.pdf`, t.ex.
`Utl 2026-007 2026-03-05 Fika kvinnodagen Josefin Andersson.pdf`. Vill du ha en mapp per
verksamhetsår: skapa mappen och byt `GOOGLE_DRIVE_FOLDER_ID` vid årsskiftet (1 juli). En
kommitté kan få en egen mapp genom att mappens ID anges under *Kassör → Kommittéer*; mappen
måste då vara delad med ekonomi@ (redigeringsrätt).

### 3. E-post

Mailen skickas via **Googles mail-API**, inte via SMTP. Skälet är att Railway och de flesta
andra molnplattformar blockerar utgående SMTP-trafik på samtliga portar för att motverka
skräppost. Mail-API:t går över vanlig HTTPS och påverkas inte av det.

Avsändaren är **utläggsboten**, ett eget konto (utlagg@mtek.chalmers.se) med en egen nyckel
som bara får skicka mail. Det gör att utskicken fortsätter komma från samma avsändare även när
kassören byts ut. Svarsadressen sätts per mail till den kassör som äger utlägget, så ett svar
från utläggaren landar hos rätt person och inte hos boten.

1. Aktivera **Gmail API** i Cloud-projektet (*APIs & Services → Library*).
2. Kör `npm run mail:auth` och logga in som **utlagg@mtek.chalmers.se**. Klistra in den
   utskrivna `MAIL_GOOGLE_REFRESH_TOKEN` i `.env`.
3. Sätt `MAIL_FROM` till `Utläggsboten <utlagg@mtek.chalmers.se>`.
4. `MAIL_ADMIN` är adressen som får notiser om utlägg utan egen kommittékassör. `MAIL_ARCHIVE`
   (frivillig) får en kopia av varje **utbetald** blankett.
5. Testa under *Kassör → Inställningar → Kopplingar → Skicka testmail*.

Utan `MAIL_GOOGLE_REFRESH_TOKEN` skickas mailen i stället med samma konto som Drive (ekonomi@).
Kör man appen på en egen server där utgående SMTP fungerar går det att använda SMTP: fyll i
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` och `SMTP_PASS`. `MAIL_TRANSPORT` kan sättas till `gmail`,
`smtp` eller `outbox` för att tvinga ett visst val. Utan något av dem sparas mailen som
`.eml`-filer i `data/outbox`, vilket är praktiskt lokalt.

**Vilka mail som skickas.** Utläggaren får mail när utlägget skickats in, när komplettering
begärs, när det nekas och när det betalats ut. Något separat mail vid *godkännande* skickas
medvetet inte: utlägg godkänns och betalas i praktiken samtidigt, och statusen syns ändå på
webben. Den färdiga blanketten bifogas först i utbetalningsmailet, eftersom den inte är
komplett förrän utbetalningsdatumet står i den.

### 4. Kommittéer och kassörer

Logga in som sektionskassör, gå till *Kassör → Kommittéer*. Justera namn och ordning, och ange
kassörens namn och e-post för de kommittéer som ska sköta sina utlägg själva. Kommittékassören
loggar sedan in med samma e-post (Google-konto) och lägger in sin signatur under *Inställningar*.

### 5. Kassörens signatur

Varje kassör: *Kassör → Inställningar*, skriv ditt namn och rita din signatur (gärna på mobil
eller surfplatta). Utan signatur går det inte att godkänna utlägg.

## Drift

Appen behöver Node.js 20 eller senare och en **beständig disk**: databasen, kvittona och
PDF:erna ligger i `data/`. Rena serverless-tjänster utan disk fungerar därför inte utan att först
byta till Postgres och extern fillagring.

Uppmätt i drift: cirka 400 MB minne, en processorkärna räcker, och 3–7 MB disk per utlägg
(ungefär 1–3 GB per verksamhetsår). Utgående HTTPS till `googleapis.com` och
`accounts.google.com` krävs. Ingen utgående SMTP behövs.

`GET /api/health` svarar 200 när appen når databasen och 503 annars. Den används av
Docker-bildens HEALTHCHECK och kan pekas ut i lastbalanserare och övervakning.

### Med Docker (rekommenderat)

Ett GitHub-flöde (`.github/workflows/docker.yml`) bygger bilden vid varje push till `main` och
publicerar den i GitHub Container Registry:

```
ghcr.io/ekonomi-cloud/utlaggssystem:latest
```

`docker-compose.yml` är skriven för att klistras in som en stack i Portainer. Den beskriver
volymen, hälsokontrollen och vilka miljövariabler som behövs, och innehåller ett avstängt
Postgres-alternativ för den som hellre vill det. Lägg en ifylld `.env` bredvid filen.

```bash
docker compose pull && docker compose up -d
```

Behållaren kör som en egen användare (inte root), sätter tidszonen till Europe/Stockholm och
kör `prisma migrate deploy` vid varje start. Migreringarna är idempotenta.

Underhållsskripten fungerar även i behållaren, eftersom Prisma-CLI och tsx ingår bland
produktionsberoendena:

```bash
docker exec -it utlagg npx tsx --conditions react-server scripts/smoke-test.ts
docker exec -it utlagg npx tsx scripts/db-status.ts
```

### Utan Docker

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start          # lyssnar på porten i PORT, annars 3000
```

Sätt alla variabler i `.env` (eller som miljövariabler) och lägg en reverse proxy med HTTPS
framför. Ta backup av `data/` regelbundet.

### Byta databas till Postgres

1. Ändra `provider = "postgresql"` i `prisma/schema.prisma` och sätt `DATABASE_URL` till
   Postgres-adressen.
2. Ta bort mappen `prisma/migrations` och kör `npx prisma migrate dev --name init`.
3. Allt annat fungerar oförändrat.

## Överlämning till nästa kassör

- Byt `ADMIN_EMAILS` om sektionskassörens mail ändras (annars ärver nästa kassör kontot ekonomi@).
- Ny kassör lägger in sitt namn och sin signatur under *Inställningar*. Kommittékassörer byts
  under *Kommittéer*.
- Standardlistan över kommittéer, attesttexten, filgränser och verksamhetsårets start finns i
  `src/lib/config.ts`. Tidsgränser för påminnelser och gallring sätts i `.env`.
- Mailtexterna finns i `src/lib/email.ts`, blankettens utseende i `src/lib/pdf.ts`.

## Kodstruktur

```
prisma/schema.prisma        Datamodell
src/auth.ts                 Inloggning (Google + utvecklarläge)
src/instrumentation.ts      Startar den interna schemaläggaren
src/lib/dal.ts              requireUser / requireTreasurer / requireAdmin / canManage
src/lib/config.ts           Standardkommittéer, statusar, gränser, attesttext
src/lib/committees.ts       Kommittéer, ansvarig kassör, Drive-mapp per kommitté
src/lib/validation.ts       Valideringsregler (zod), används i både webbläsare och server
src/lib/banks.ts            Clearingnummer -> bank
src/lib/crypto.ts           Kryptering av kontonummer
src/lib/pdf.ts              Generering av blankett + kvitton
src/lib/drive.ts            Uppladdning till Google Drive
src/lib/email.ts            Mailutskick och mallar
src/lib/jobs.ts             Påminnelser och gallring
src/lib/scheduler.ts        Kör jobben en gång per dygn
src/app/utlagg/             Utläggarens sidor och serveraktioner
src/app/admin/              Kassörernas sidor och serveraktioner (inkl. kommitteer/, installningar/)
src/app/api/upload          Uppladdning av kvitton
src/app/api/files/[id]      Hämta kvittofil (bara ägare/kassör)
src/app/api/expenses/[id]/pdf  Hämta blankett-PDF
src/app/api/jobs            Extern trigger för de dagliga jobben
src/components/             Formulär, signaturruta, uppladdare, adminåtgärder
scripts/drive-auth.ts       Hämta refresh-token till Drive (och med --mail till utläggsboten)
scripts/smoke-test.ts       Självtest av hela kedjan, städar efter sig. Säkert i produktion
scripts/db-status.ts        Visar vad databasen innehåller
scripts/committee-status.ts Visar kommittéer och deras kassörer
scripts/sort-committees.ts  Numrerar om kommittélistan i bokstavsordning
scripts/set-treasurers.ts   Kopplar kommittéer till kassörer
scripts/seed-test.ts        Testdata för lokal utveckling
scripts/test-jobs.ts        Kör de dagliga jobben mot backdaterad testdata
scripts/render-pdf.ts       Generera en blankett-PDF till fil
scripts/set-treasurers.ts   Koppla kommittéer till kassörer
.github/workflows/docker.yml  Bygger och publicerar containern till ghcr.io
docker-compose.yml          Stack för Portainer, med kraven beskrivna
```

## Säkerhet och GDPR

- Kontonummer krypteras med AES-256-GCM (`ENCRYPTION_KEY`). Tappas nyckeln kan de inte läsas.
  Kontonumret gallras automatiskt ur databasen en tid efter utbetalning.
- Kvittofiler och PDF:er kan bara hämtas av utläggaren själv eller ansvarig kassör.
- Utläggaren ser bara sina egna utlägg. Kommittékassörer ser bara sin kommittés utlägg.
- Utlägg och kvitton ska sparas enligt bokföringslagen (7 år). PDF:erna i Drive innehåller
  kontonumret, så Drive-mappen bör bara delas med den som behöver den.
