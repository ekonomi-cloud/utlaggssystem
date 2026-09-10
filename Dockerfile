# Utläggssystemet, Maskinteknologsektionen.
#
# Bygger en körklar behållare i tre steg, så att bygg-verktygen inte följer med
# in i den färdiga bilden. Kör som en vanlig långlivad Node-process och behöver
# en beständig volym monterad på /app/data (databas, kvitton och PDF:er).
#
# Bygg:  docker build -t utlagg .
# Kör:   docker run -p 3000:3000 -v utlagg-data:/app/data --env-file .env utlagg

# ---------- 1. Beroenden för bygget ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# openssl behövs av Prisma; utan det varnar den och kan välja fel motor.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- 2. Bygg applikationen ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. Körbar bild ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Svensk tid, så att tidpunkter i gränssnittet och i mailen visas som användarna
# förväntar sig. Kalenderdatum (kvittodatum) lagras i UTC och påverkas inte.
ENV TZ=Europe/Stockholm
ENV PORT=3000

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates tzdata wget \
  && rm -rf /var/lib/apt/lists/*

# Endast produktionsberoenden. Prisma-CLI, tsx och dotenv ligger bland dem, så
# att migreringar och underhållsskript kan köras i den färdiga behållaren.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY tsconfig.json ./tsconfig.json
COPY assets ./assets
COPY scripts ./scripts
COPY src ./src

# Kör inte som root. Katalogen för data ägs av appanvändaren, så att den kan
# skriva dit även när volymen monteras.
RUN useradd --system --create-home --uid 10001 utlagg \
  && mkdir -p /app/data \
  && chown -R utlagg:utlagg /app
USER utlagg

EXPOSE 3000

# Portainer och Docker använder den här för att se om tjänsten mår bra.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

# Migreringarna körs vid varje start: de är idempotenta och gör inget om
# databasen redan är aktuell.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
