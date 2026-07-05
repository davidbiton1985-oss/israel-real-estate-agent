-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "yad2ListingId" TEXT,
    "rawText" TEXT NOT NULL,
    "dealType" TEXT,
    "city" TEXT,
    "neighborhood" TEXT,
    "street" TEXT,
    "price" INTEGER,
    "rooms" REAL,
    "sizeSqm" INTEGER,
    "floor" INTEGER,
    "totalFloors" INTEGER,
    "balcony" BOOLEAN,
    "parking" BOOLEAN,
    "elevator" BOOLEAN,
    "mamad" BOOLEAN,
    "storage" BOOLEAN,
    "garden" BOOLEAN,
    "condition" TEXT,
    "furnished" TEXT,
    "propertyType" TEXT,
    "entryImmediate" BOOLEAN,
    "entryFlexible" BOOLEAN,
    "entryDate" TEXT,
    "arnonaMonthly" INTEGER,
    "vaadMonthly" INTEGER,
    "brokerStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "brokerConfidence" TEXT NOT NULL DEFAULT 'low',
    "brokerEvidence" TEXT,
    "brokerFeeStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "brokerFeeText" TEXT,
    "fingerprint" TEXT NOT NULL,
    "isDuplicateOf" TEXT,
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Listing" ("balcony", "brokerEvidence", "brokerFeeStatus", "brokerFeeText", "brokerStatus", "city", "createdAt", "dealType", "elevator", "entryImmediate", "fingerprint", "floor", "id", "isDuplicateOf", "mamad", "neighborhood", "parking", "price", "propertyType", "rawText", "rooms", "scanned", "sizeSqm", "source", "street", "url", "yad2ListingId") SELECT "balcony", "brokerEvidence", "brokerFeeStatus", "brokerFeeText", "brokerStatus", "city", "createdAt", "dealType", "elevator", "entryImmediate", "fingerprint", "floor", "id", "isDuplicateOf", "mamad", "neighborhood", "parking", "price", "propertyType", "rawText", "rooms", "scanned", "sizeSqm", "source", "street", "url", "yad2ListingId" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
