-- AlterTable
ALTER TABLE "Match" ADD COLUMN "lastAlertedPrice" INTEGER;
ALTER TABLE "Match" ADD COLUMN "lastAlertedSnapshot" TEXT;

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "message" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "priceHistory" TEXT NOT NULL DEFAULT '[]',
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Listing" ("arnonaMonthly", "balcony", "brokerConfidence", "brokerEvidence", "brokerFeeStatus", "brokerFeeText", "brokerStatus", "city", "condition", "createdAt", "dealType", "elevator", "entryDate", "entryFlexible", "entryImmediate", "fingerprint", "floor", "furnished", "garden", "id", "isDuplicateOf", "mamad", "neighborhood", "parking", "price", "propertyType", "rawText", "rooms", "scanned", "sizeSqm", "source", "storage", "street", "totalFloors", "url", "vaadMonthly", "yad2ListingId") SELECT "arnonaMonthly", "balcony", "brokerConfidence", "brokerEvidence", "brokerFeeStatus", "brokerFeeText", "brokerStatus", "city", "condition", "createdAt", "dealType", "elevator", "entryDate", "entryFlexible", "entryImmediate", "fingerprint", "floor", "furnished", "garden", "id", "isDuplicateOf", "mamad", "neighborhood", "parking", "price", "propertyType", "rawText", "rooms", "scanned", "sizeSqm", "source", "storage", "street", "totalFloors", "url", "vaadMonthly", "yad2ListingId" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "cities" TEXT NOT NULL,
    "neighborhoods" TEXT,
    "streets" TEXT,
    "priceMin" INTEGER,
    "priceMax" INTEGER NOT NULL,
    "roomsMin" REAL,
    "roomsMax" REAL,
    "sizeMinSqm" INTEGER,
    "propertyType" TEXT,
    "entryBy" TEXT,
    "balcony" TEXT NOT NULL DEFAULT 'INDIFFERENT',
    "parking" TEXT NOT NULL DEFAULT 'INDIFFERENT',
    "elevator" TEXT NOT NULL DEFAULT 'INDIFFERENT',
    "mamad" TEXT NOT NULL DEFAULT 'INDIFFERENT',
    "brokerStatusPref" TEXT NOT NULL DEFAULT 'any',
    "brokerFeePref" TEXT NOT NULL DEFAULT 'unknown_allowed',
    "maxFeeIfKnown" INTEGER,
    "whatsappThreshold" INTEGER NOT NULL DEFAULT 80,
    "dashboardThreshold" INTEGER NOT NULL DEFAULT 60,
    "priceDropReAlert" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Profile" ("active", "balcony", "brokerFeePref", "brokerStatusPref", "cities", "createdAt", "dashboardThreshold", "dealType", "elevator", "entryBy", "id", "mamad", "maxFeeIfKnown", "name", "neighborhoods", "parking", "priceMax", "priceMin", "propertyType", "roomsMax", "roomsMin", "sizeMinSqm", "streets", "whatsappThreshold") SELECT "active", "balcony", "brokerFeePref", "brokerStatusPref", "cities", "createdAt", "dashboardThreshold", "dealType", "elevator", "entryBy", "id", "mamad", "maxFeeIfKnown", "name", "neighborhoods", "parking", "priceMax", "priceMin", "propertyType", "roomsMax", "roomsMin", "sizeMinSqm", "streets", "whatsappThreshold" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
