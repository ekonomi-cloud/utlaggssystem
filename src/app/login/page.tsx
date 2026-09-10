import { redirect } from "next/navigation";
import { signIn, googleEnabled, devLoginEnabled, allowedDomains } from "@/auth";
import { getSessionUser } from "@/lib/dal";

export const metadata = { title: "Logga in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/utlagg";
  if (user) redirect(callbackUrl);
  const error = typeof params.error === "string" ? params.error : null;
  const domains = allowedDomains();

  return (
    <main className="container narrow">
      <div className="card accent" style={{ maxWidth: 480, margin: "2rem auto" }}>
        <h1>Logga in</h1>
        <p className="muted">
          Logga in med ditt Google-konto för att göra utlägg och följa dina tidigare utlägg.
        </p>
        {error === "AccessDenied" ? (
          <div className="alert error">
            <p>
              <strong>Det kontot får inte logga in här.</strong>
            </p>
            <p>
              {domains.length > 0
                ? `Använd ett konto på ${domains.join(", ")}. Har du bara en privat adress, hör av dig till ekonomi@mtek.chalmers.se.`
                : "Hör av dig till ekonomi@mtek.chalmers.se så hjälper kassören dig."}
            </p>
          </div>
        ) : error ? (
          <div className="alert error">
            <p>Inloggningen misslyckades. Försök igen.</p>
          </div>
        ) : null}
        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <button className="google-btn" type="submit">
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
                <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.3 0 20 0 24s1 7.7 2.7 10.7l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
              </svg>
              Logga in med Google
            </button>
          </form>
        )}
        {devLoginEnabled && (
          <form
            action={async (formData) => {
              "use server";
              await signIn("dev", {
                email: String(formData.get("email") ?? ""),
                name: String(formData.get("name") ?? ""),
                redirectTo: callbackUrl,
              });
            }}
          >
            <div className="alert warn">
              <p>
                <strong>Utvecklarläge.</strong> Google-inloggning är inte konfigurerad, så du kan logga in med valfri
                e-postadress. Använd adressen i ADMIN_EMAILS för att komma åt kassörsvyn.
              </p>
            </div>
            <div className="field">
              <label htmlFor="email">E-post</label>
              <input className="input" id="email" name="email" type="email" required placeholder="namn@student.chalmers.se" />
            </div>
            <div className="field">
              <label htmlFor="name">Namn</label>
              <input className="input" id="name" name="name" type="text" placeholder="Förnamn Efternamn" />
            </div>
            <button className="btn primary block" type="submit">
              Logga in
            </button>
          </form>
        )}
        {!googleEnabled && !devLoginEnabled && (
          <div className="alert error">
            <p>Ingen inloggningsmetod är konfigurerad. Sätt AUTH_GOOGLE_ID och AUTH_GOOGLE_SECRET i .env.</p>
          </div>
        )}
      </div>
    </main>
  );
}
