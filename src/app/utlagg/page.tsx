import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDay, formatNumber, formatSek } from "@/lib/format";
import { maskAccount, decrypt } from "@/lib/crypto";
import { createDraft, forgetSavedDetails } from "./actions";

export const metadata = { title: "Mina utlägg" };

export default async function MyExpensesPage({ searchParams }: PageProps<"/utlagg">) {
  const user = await requireUser();
  const params = await searchParams;
  const [expenses, profile] = await Promise.all([
    prisma.expense.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }] }),
    prisma.user.findUnique({ where: { id: user.id } }),
  ]);
  const savedAccount = decrypt(profile?.savedAccountNumber);

  return (
    <main className="container">
      {params.behorighet === "saknas" && (
        <div className="alert warn">
          <p>Du har inte behörighet till kassörsvyn. Du är inloggad som {user.email}.</p>
        </div>
      )}
      {params.glomt === "1" && (
        <div className="alert success">
          <p>Dina sparade kontouppgifter är borttagna. Du fyller i dem igen vid nästa utlägg.</p>
        </div>
      )}
      <div className="page-head">
        <div>
          <h1>Mina utlägg</h1>
          <p className="muted" style={{ margin: 0 }}>
            Här ser du status för dina utlägg. Du får också mail vid varje steg.
          </p>
        </div>
        <form action={createDraft}>
          <button className="btn primary" type="submit">
            + Nytt utlägg
          </button>
        </form>
      </div>

      <div className="card">
        {expenses.length === 0 ? (
          <div className="empty">
            <p>Du har inga utlägg ännu.</p>
            <form action={createDraft}>
              <button className="btn primary large" type="submit">
                Gör ditt första utlägg
              </button>
            </form>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nr</th>
                  <th>Titel</th>
                  <th>Kommitté</th>
                  <th>Köpdatum</th>
                  <th className="num">Summa</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{formatNumber(e.year, e.number)}</td>
                    <td>
                      <Link href={e.status === "UTKAST" ? `/utlagg/${e.id}/redigera` : `/utlagg/${e.id}`}>
                        {e.title || <span className="muted">(utan titel)</span>}
                      </Link>
                    </td>
                    <td>{e.committee ?? ""}</td>
                    <td className="mono">{formatDay(e.purchaseDate)}</td>
                    <td className="num">{formatSek(e.totalOre)}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {savedAccount && (
        <div className="card">
          <h3>Sparade kontouppgifter</h3>
          <p className="small muted">
            {profile?.savedBankName}, clearing {profile?.savedClearing}, konto {maskAccount(savedAccount)}. Uppgifterna
            förifylls i nästa utlägg och lagras krypterat.
          </p>
          <form action={forgetSavedDetails}>
            <button className="btn small" type="submit">
              Ta bort sparade kontouppgifter
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
