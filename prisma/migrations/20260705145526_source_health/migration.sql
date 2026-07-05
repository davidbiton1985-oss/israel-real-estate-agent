-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastItemsFound" INTEGER NOT NULL DEFAULT 0,
    "lastNewListings" INTEGER NOT NULL DEFAULT 0,
    "totalIngested" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceHealth_source_key" ON "SourceHealth"("source");
