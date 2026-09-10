import "server-only";
import { prisma } from "@/lib/prisma";
import { COMMITTEES } from "@/lib/config";
import { adminMail } from "@/lib/email";

export type CommitteeOption = { id: string; name: string };

/** Aktiva kommittéer i visningsordning, för rullistan i formuläret. Fylls med standardlistan första gången. */
export async function activeCommittees(): Promise<CommitteeOption[]> {
  if ((await prisma.committee.count()) === 0) await importDefaultCommittees();
  const rows = await prisma.committee.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return rows;
}

/** Lägger in standardlistan från config om tabellen är tom. Returnerar antal skapade. */
export async function importDefaultCommittees(): Promise<number> {
  let created = 0;
  for (const [i, name] of COMMITTEES.entries()) {
    const exists = await prisma.committee.findUnique({ where: { name } });
    if (exists) continue;
    await prisma.committee.create({ data: { name, sortOrder: (i + 1) * 10 } });
    created++;
  }
  return created;
}

/** Vem ska få notiser om ett utlägg? Kommitténs kassör, annars sektionskassören. */
export async function responsibleEmail(committeeId: string | null | undefined): Promise<string> {
  if (!committeeId) return adminMail();
  const c = await prisma.committee.findUnique({ where: { id: committeeId }, select: { treasurerEmail: true, active: true } });
  return c?.treasurerEmail?.trim() || adminMail();
}

/** Drive-mapp för en kommitté, eller standardmappen. */
export async function driveFolderFor(committeeId: string | null | undefined): Promise<string | undefined> {
  if (!committeeId) return undefined;
  const c = await prisma.committee.findUnique({ where: { id: committeeId }, select: { driveFolderId: true } });
  return c?.driveFolderId?.trim() || undefined;
}
