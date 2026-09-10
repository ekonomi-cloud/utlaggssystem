import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { manageableFilter, requireTreasurer } from "@/lib/dal";
import { STATUS, STATUS_LABEL, reminderDays, type Status } from "@/lib/config";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatDay, formatNumber, formatSek } from "@/lib/format";

export const metadata = { title: "Kassör" };

const TABS: { key: string; label: string; statuses: Status[] }[] = [
  { key: "att-hantera", label: "Att hantera", statuses: [STATUS.INSKICKAD] },
  { key: "att-betala", label: "Att betala", statuses: [STATUS.GODKAND] },
  { key: "komplettering", label: "Väntar på komplettering", statuses: [STATUS.KOMPLETTERING] },
  { key: "utbetalda", label: "Utbetalda", statuses: [STATUS.UTBETALD] },
  { key: "nekade", label: "Nekade", statuses: [STATUS.NEKAD] },
  { key: "alla", label: "Alla", statuses: [] },
];

/** Antal dagar ett utlägg väntat på nästa steg, eller null om inget väntar. */
function waitingDays(e: { status: string; submittedAt: Date | null; approvedAt: Date | null }): number | null {
  const since = e.status === STATUS.INSKICKAD ? e.submittedAt : e.status === STATUS.GODKAND ? e.approvedAt : null;
  if (!since) return null;
  return Math.floor((Date.now() - since.getTime()) / 86_400_000);
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireTreasurer();
  const sp = await searchParams;
  const tabKey = typeof sp.flik === "string" ? sp.flik : "att-hantera";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const committeeFilter = typeof sp.kommitte === "string" ? sp.kommitte : "";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const scope = manageableFilter(user);

  const [counts, committees] = await Promise.all([
    prisma.expense.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { totalOre: true },
      where: { status: { not: STATUS.UTKAST }, ...scope },
    }),
    user.isAdmin
      ? prisma.committee.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } })
      : prisma.committee.findMany({ where: { id: { in: user.treasurerOf } }, select: { id: true, name: true } }),
  ]);
  const countOf = (statuses: Status[]) =>
    counts.filter((c) => statuses.length === 0 || statuses.includes(c.status as Status)).reduce((n, c) => n + c._count._all, 0);
  const sumOf = (status: Status) => counts.find((c) => c.status === status)?._sum.totalOre ?? 0;

  const expenses = await prisma.expense.findMany({
    where: {
      status: tab.statuses.length ? { in: tab.statuses } : { not: STATUS.UTKAST },
      ...scope,
      ...(committeeFilter === "annan" ? { committeeId: null } : committeeFilter ? { committeeId: committeeFilter } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { payeeName: { contains: q } },
              { committee: { contains: q } },
              { payeeEmail: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ submittedAt: "desc" }],
    take: 300,
  });
  const limit = reminderDays();

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Kassörsvyn</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user.isAdmin
              ? "Granska, godkänn och betala ut utlägg."
              : `Utlägg för ${committees.map((c) => c.name).join(", ") || "dina kommittéer"}.`}
          </p>
        </div>
        <div className="btn-row">
          {user.isAdmin && (
            <Link href="/admin/kommitteer" className="btn small">
              Kommittéer
            </Link>
          )}
          <Link href="/admin/installningar" className="btn small">
            Inställningar
          </Link>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="value">{countOf([STATUS.INSKICKAD])}</div>
          <div className="label">Att granska</div>
        </div>
        <div className="stat">
          <div className="value">{formatSek(sumOf(STATUS.INSKICKAD))}</div>
          <div className="label">Väntar på beslut</div>
        </div>
        <div className="stat">
          <div className="value">{countOf([STATUS.GODKAND])}</div>
          <div className="label">Att betala ut</div>
        </div>
        <div className="stat">
          <div className="value">{formatSek(sumOf(STATUS.GODKAND))}</div>
          <div className="label">Summa att betala</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin?flik=${t.key}${committeeFilter ? `&kommitte=${committeeFilter}` : ""}`} className={t.key === tab.key ? "active" : ""}>
            {t.label}
            <span className="count">{countOf(t.statuses)}</span>
          </Link>
        ))}
      </div>

      <div className="card">
        <form method="get" className="btn-row" style={{ marginBottom: "1rem" }}>
          <input type="hidden" name="flik" value={tab.key} />
          <input className="input" name="q" defaultValue={q} placeholder="Sök titel, namn, kommitté…" style={{ maxWidth: 320 }} />
          {user.isAdmin && (
            <select className="select" name="kommitte" defaultValue={committeeFilter} style={{ maxWidth: 240 }}>
              <option value="">Alla kommittéer</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="annan">Annan förening</option>
            </select>
          )}
          <button className="btn small" type="submit">
            Filtrera
          </button>
          {(q || committeeFilter) && (
            <Link href={`/admin?flik=${tab.key}`} className="btn small ghost">
              Rensa
            </Link>
          )}
        </form>
        {expenses.length === 0 ? (
          <div className="empty">
            Inga utlägg under {STATUS_LABEL[tab.statuses[0]]?.toLowerCase() ?? "den här fliken"}
            {q || committeeFilter ? " med det här filtret" : ""}.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nr</th>
                  <th>Inskickat</th>
                  <th>Titel</th>
                  <th>Namn</th>
                  <th>Kommitté</th>
                  <th>Köpdatum</th>
                  <th className="num">Summa</th>
                  <th>Status</th>
                  <th className="num">Väntat</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const days = waitingDays(e);
                  return (
                    <tr key={e.id}>
                      <td className="mono">
                        <Link href={`/admin/${e.id}`}>{formatNumber(e.year, e.number)}</Link>
                      </td>
                      <td className="mono small">{formatDateTime(e.submittedAt)}</td>
                      <td>
                        <Link href={`/admin/${e.id}`}>
                          <strong>{e.title}</strong>
                        </Link>
                      </td>
                      <td>{e.payeeName}</td>
                      <td>{e.committee}</td>
                      <td className="mono">{formatDay(e.purchaseDate)}</td>
                      <td className="num">{formatSek(e.totalOre)}</td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="num">
                        {days === null ? "" : (
                          <span className={days >= limit ? "badge KOMPLETTERING" : "muted"} title={days >= limit ? "Har väntat länge" : undefined}>
                            {days} d
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {expenses.length > 0 && (
          <p className="small muted" style={{ margin: "0.75rem 0 0" }}>
            Utlägg som väntat {limit} dagar eller mer markeras i gult. Kassören får då också en påminnelse via mail.
          </p>
        )}
      </div>
    </main>
  );
}
