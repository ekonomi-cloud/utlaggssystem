import Link from "next/link";
import { getSessionUser } from "@/lib/dal";

export default async function Home() {
  const user = await getSessionUser();
  return (
    <main className="container">
      <section className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Maskinteknologsektionen" />
        <div>
          <p className="title">Gör utlägg till Maskinteknologsektionen</p>
          <p className="subtitle">Fyll i, signera och skicka in direkt här. Inga blanketter, inga mail.</p>
          <p>
            Har du lagt ut pengar för sektionen? Här fyller du i samma uppgifter som på utläggsblanketten,
            laddar upp dina kvitton och signerar. Kassören granskar utlägget och du får mail när det är godkänt
            och när pengarna är på väg.
          </p>
          <div className="btn-row">
            {user ? (
              <>
                <Link href="/utlagg/nytt" className="btn primary large">
                  Nytt utlägg
                </Link>
                <Link href="/utlagg" className="btn large">
                  Mina utlägg
                </Link>
              </>
            ) : (
              <Link href="/login" className="btn primary large">
                Logga in och gör ett utlägg
              </Link>
            )}
          </div>
        </div>
      </section>

      <h2 style={{ margin: "1.5rem 0 0.75rem" }}>Så funkar det</h2>
      <section className="howto">
        <div className="step">
          <div className="num">1</div>
          <h3>Logga in</h3>
          <p>Använd ditt Google-konto. Dina kontouppgifter sparas så att nästa utlägg går snabbare.</p>
        </div>
        <div className="step">
          <div className="num">2</div>
          <h3>Fyll i och ladda upp</h3>
          <p>Vad du köpt, för vilken kommitté, när och för hur mycket. Fota eller ladda upp alla kvitton.</p>
        </div>
        <div className="step">
          <div className="num">3</div>
          <h3>Signera och skicka</h3>
          <p>Intyga att uppgifterna stämmer och signera med fingret eller musen. Klart!</p>
        </div>
        <div className="step">
          <div className="num">4</div>
          <h3>Få pengarna</h3>
          <p>Kassören godkänner och betalar ut. Du får mail vid varje steg.</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Bra att veta innan du börjar</h2>
        <ul>
          <li>
            <strong>Kvittot måste vara tydligt läsbart.</strong> Fota rakt ovanifrån i bra ljus så att belopp, datum
            och butik syns. Suddiga kvitton godkänns inte.
          </li>
          <li>
            <strong>Ha kontouppgifterna redo:</strong> bank, clearingnummer och kontonummer. Banken fylls i
            automatiskt när du anger clearingnumret.
          </li>
          <li>
            <strong>Flera kvitton?</strong> Lägg till ett delbelopp per kvitto så räknas totalsumman ut åt dig.
          </li>
          <li>
            Utlägg ska gynna gemene maskinteknolog. Osäker på om något får köpas? Fråga kassören först:{" "}
            <a href="mailto:ekonomi@mtek.chalmers.se">ekonomi@mtek.chalmers.se</a>.
          </li>
        </ul>
      </section>
    </main>
  );
}
