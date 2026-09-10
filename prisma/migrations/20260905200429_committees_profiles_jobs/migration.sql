-- CreateTable
CREATE TABLE "Committee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "treasurerEmail" TEXT,
    "treasurerName" TEXT,
    "driveFolderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TreasurerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signatureData" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UTKAST',
    "year" INTEGER,
    "number" INTEGER,
    "committeeId" TEXT,
    "committee" TEXT,
    "title" TEXT,
    "description" TEXT,
    "purchaseDate" DATETIME,
    "totalOre" INTEGER NOT NULL DEFAULT 0,
    "payeeName" TEXT,
    "payeeEmail" TEXT,
    "bankName" TEXT,
    "clearing" TEXT,
    "accountNumber" TEXT,
    "signatureData" TEXT,
    "signedAt" DATETIME,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "rejectedAt" DATETIME,
    "paidAt" DATETIME,
    "paidBy" TEXT,
    "adminMessage" TEXT,
    "reminderSentAt" DATETIME,
    "accountDeletedAt" DATETIME,
    "pdfPath" TEXT,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("accountNumber", "adminMessage", "approvedAt", "bankName", "clearing", "committee", "createdAt", "description", "driveFileId", "driveUrl", "id", "number", "paidAt", "payeeEmail", "payeeName", "pdfPath", "purchaseDate", "rejectedAt", "signatureData", "signedAt", "status", "submittedAt", "title", "totalOre", "updatedAt", "userId", "year") SELECT "accountNumber", "adminMessage", "approvedAt", "bankName", "clearing", "committee", "createdAt", "description", "driveFileId", "driveUrl", "id", "number", "paidAt", "payeeEmail", "payeeName", "pdfPath", "purchaseDate", "rejectedAt", "signatureData", "signedAt", "status", "submittedAt", "title", "totalOre", "updatedAt", "userId", "year" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_userId_status_idx" ON "Expense"("userId", "status");
CREATE INDEX "Expense_status_submittedAt_idx" ON "Expense"("status", "submittedAt");
CREATE INDEX "Expense_committeeId_status_idx" ON "Expense"("committeeId", "status");
CREATE UNIQUE INDEX "Expense_year_number_key" ON "Expense"("year", "number");
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "jobsLastRunAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("id", "updatedAt") SELECT "id", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Committee_name_key" ON "Committee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TreasurerProfile_email_key" ON "TreasurerProfile"("email");

