-- Kvitton som skapades innan varje kvitto fick ett eget datum ärver utläggets
-- köpdatum, så att blanketten och kassörsvyn visar ett datum även för dem.
-- Rör bara rader som saknar datum, och kan därför köras om utan skada.
UPDATE "Receipt"
SET "purchaseDate" = (
  SELECT "purchaseDate" FROM "Expense" WHERE "Expense"."id" = "Receipt"."expenseId"
)
WHERE "purchaseDate" IS NULL;
