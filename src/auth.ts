import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/**
 * Inloggning sker med Google-konto. Utan Google-nycklar i .env (lokal utveckling)
 * visas i stället en enkel utvecklarinloggning där man bara anger e-post.
 */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const devLoginEnabled = process.env.NODE_ENV !== "production" && !googleEnabled;

/**
 * Tillåtna e-postdomäner, kommaseparerade i ALLOWED_EMAIL_DOMAINS.
 * Tomt värde = alla Google-konton släpps in. Adresser i ADMIN_EMAILS
 * släpps alltid in, oavsett domän.
 */
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** Får den här adressen logga in? */
export function emailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const addr = email.toLowerCase();
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.includes(addr)) return true;
  const domains = allowedDomains();
  if (domains.length === 0) return true;
  const domain = addr.split("@")[1] ?? "";
  // Tillåter både domänen själv och underdomäner (t.ex. student.chalmers.se under chalmers.se).
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled ? [Google] : []),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Utvecklarinloggning",
            credentials: {
              email: { label: "E-post", type: "email" },
              name: { label: "Namn", type: "text" },
            },
            async authorize(credentials) {
              const email = String(credentials?.email ?? "").trim().toLowerCase();
              const name = String(credentials?.name ?? "").trim() || email.split("@")[0];
              if (!email.includes("@")) return null;
              const user = await prisma.user.upsert({
                where: { email },
                update: {},
                create: { email, name, emailVerified: new Date() },
              });
              return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user }) {
      // Spärrar inloggning från adresser utanför de tillåtna domänerna.
      return emailAllowed(user?.email);
    },
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = String(token.id);
      return session;
    },
  },
});
