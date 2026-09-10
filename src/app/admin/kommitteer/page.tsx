import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { deleteCommittee, importCommittees, saveCommittee } from "../actions";

export const metadata = { title: "Kommittéer" };

const MESSAGES: Record<string, { cls: string; text: string }> = {
  sparat: { cls: "success", text: "Kommittén är sparad." },
  importerat: { cls: "success", text: "Standardlistan är inlagd." },
  borttagen: { cls: "success", text: "Kommittén är borttagen." },
};
const ERRORS: Record<string, string> = {
  namn: "Ange ett namn på minst två tecken.",
  epost: "Kassörens e-postadress ser inte giltig ut.",
  dubblett: "Det finns redan en kommitté med det namnet.",
  anvands: "Kommittén har utlägg kopplade till sig och kan inte tas bort. Avmarkera ”Aktiv” i stället.",
};

export default async function CommitteesPage({ searchParams }: PageProps<"/admin/kommitteer">) {
  await requireAdmin();
  const sp = await searchParams;
  const committees = await prisma.committee.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { expenses: true } } },
  });
  const flash = Object.keys(MESSAGES).find((k) => sp[k] === "1");
  const error = typeof sp.fel === "string" ? ERRORS[sp.fel] : null;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Kommittéer och kassörer</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kommittéer som går att välja i formuläret. Ange kassörens e-post så får den personen notiser och
            tillgång till kommitténs utlägg i kassörsvyn. Lämnas fältet tomt hanteras utläggen av sektionskassören.
          </p>
        </div>
        <Link href="/admin" className="btn small">
          ← Kassörsvyn
        </Link>
      </div>

      {flash && (
        <div className={`alert ${MESSAGES[flash].cls}`}>
          <p>{MESSAGES[flash].text}</p>
        </div>
      )}
      {error && (
        <div className="alert error">
          <p>{error}</p>
        </div>
      )}

      {committees.length === 0 && (
        <div className="card">
          <p>Inga kommittéer ännu. Börja med sektionens standardlista och justera sedan.</p>
          <form action={importCommittees}>
            <button className="btn primary" type="submit">
              Lägg in standardlistan
            </button>
          </form>
        </div>
      )}

      {committees.map((c) => (
        <form key={c.id} action={saveCommittee} className="card committee-row">
          <input type="hidden" name="id" value={c.id} />
          <div className="row cols-4">
            <div className="field compact">
              <label htmlFor={`name-${c.id}`}>Namn</label>
              <input id={`name-${c.id}`} className="input" name="name" defaultValue={c.name} required />
            </div>
            <div className="field compact">
              <label htmlFor={`tn-${c.id}`}>Kassörens namn</label>
              <input id={`tn-${c.id}`} className="input" name="treasurerName" defaultValue={c.treasurerName ?? ""} placeholder="Förnamn Efternamn" />
            </div>
            <div className="field compact">
              <label htmlFor={`te-${c.id}`}>Kassörens e-post</label>
              <input id={`te-${c.id}`} className="input" name="treasurerEmail" type="email" defaultValue={c.treasurerEmail ?? ""} placeholder="kassor.xxx@mtek.chalmers.se" />
            </div>
            <div className="field compact">
              <label htmlFor={`df-${c.id}`}>Egen Drive-mapp (ID)</label>
              <input id={`df-${c.id}`} className="input mono" name="driveFolderId" defaultValue={c.driveFolderId ?? ""} placeholder="tomt = standardmappen" />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: "0.75rem", justifyContent: "space-between" }}>
            <div className="btn-row">
              <label className="checkbox" style={{ alignItems: "center" }}>
                <input type="checkbox" name="active" defaultChecked={c.active} />
                <span>Aktiv (går att välja)</span>
              </label>
              <label className="small muted" htmlFor={`so-${c.id}`}>
                Ordning
              </label>
              <input id={`so-${c.id}`} className="input" name="sortOrder" type="number" defaultValue={c.sortOrder} style={{ width: 90 }} />
              <span className="small muted">{c._count.expenses} utlägg</span>
            </div>
            <div className="btn-row">
              {c._count.expenses === 0 && (
                <button className="btn small ghost" type="submit" formAction={deleteCommittee}>
                  Ta bort
                </button>
              )}
              <button className="btn small primary" type="submit">
                Spara
              </button>
            </div>
          </div>
        </form>
      ))}

      <form action={saveCommittee} className="card accent">
        <h2>Lägg till kommitté</h2>
        <div className="row cols-4">
          <div className="field compact">
            <label htmlFor="new-name">Namn</label>
            <input id="new-name" className="input" name="name" required placeholder="T.ex. MnollK" />
          </div>
          <div className="field compact">
            <label htmlFor="new-tn">Kassörens namn</label>
            <input id="new-tn" className="input" name="treasurerName" />
          </div>
          <div className="field compact">
            <label htmlFor="new-te">Kassörens e-post</label>
            <input id="new-te" className="input" name="treasurerEmail" type="email" />
          </div>
          <div className="field compact">
            <label htmlFor="new-df">Egen Drive-mapp (ID)</label>
            <input id="new-df" className="input mono" name="driveFolderId" />
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: "0.75rem" }}>
          <label className="checkbox" style={{ alignItems: "center" }}>
            <input type="checkbox" name="active" defaultChecked />
            <span>Aktiv</span>
          </label>
          <label className="small muted" htmlFor="new-so">
            Ordning
          </label>
          <input id="new-so" className="input" name="sortOrder" type="number" defaultValue={(committees.at(-1)?.sortOrder ?? 0) + 10} style={{ width: 90 }} />
          <button className="btn primary" type="submit">
            Lägg till
          </button>
        </div>
      </form>

      {committees.length > 0 && (
        <form action={importCommittees}>
          <button className="btn small ghost" type="submit">
            Lägg till saknade från standardlistan
          </button>
        </form>
      )}
    </main>
  );
}
