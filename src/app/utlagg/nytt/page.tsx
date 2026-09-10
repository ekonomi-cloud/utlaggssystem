import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { createDraft } from "../actions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Nytt utlägg" };

export default async function NewExpensePage() {
  const user = await requireUser();
  const drafts = await prisma.expense.findMany({
    where: { userId: user.id, status: "UTKAST" },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="container narrow">
      <div className="card accent">
        <h1>Nytt utlägg</h1>
        <p>
          Du kommer att fylla i fyra korta steg: vad utlägget gäller, kvitton och belopp, dina kontouppgifter,
          och till sist attest med signatur. Formuläret sparas som utkast medan du fyller i.
        </p>
        <p className="muted small">Ha kvittona och dina kontouppgifter redo, så tar det bara några minuter.</p>
        <form action={createDraft}>
          <button className="btn primary large" type="submit">
            Starta nytt utlägg
          </button>
        </form>
      </div>
      {drafts.length > 0 && (
        <div className="card">
          <h2>Påbörjade utkast</h2>
          <ul>
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/utlagg/${d.id}/redigera`}>{d.title || "(utan titel)"}</Link>{" "}
                <span className="muted small">senast ändrat {formatDateTime(d.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
