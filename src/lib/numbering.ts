import "server-only";
import { prisma } from "@/lib/prisma";
import { fiscalYear } from "@/lib/config";

/**
 * Ger ett utlägg ett löpnummer inom verksamhetsåret första gången det skickas in.
 * Returnerar { year, number }.
 */
export async function assignNumber(expenseId: string): Promise<{ year: number; number: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
    if (existing.year && existing.number) return { year: existing.year, number: existing.number };
    const year = fiscalYear();
    const last = await tx.expense.findFirst({
      where: { year },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    await tx.expense.update({ where: { id: expenseId }, data: { year, number } });
    return { year, number };
  });
}
