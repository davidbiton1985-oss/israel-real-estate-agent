-- CreateTable
CREATE TABLE "Profile" (
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
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Listing" (
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
    "balcony" BOOLEAN,
    "parking" BOOLEAN,
    "elevator" BOOLEAN,
    "mamad" BOOLEAN,
    "propertyType" TEXT,
    "entryImmediate" BOOLEAN,
    "brokerStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "brokerEvidence" TEXT,
    "brokerFeeStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "brokerFeeText" TEXT,
    "fingerprint" TEXT NOT NULL,
    "isDuplicateOf" TEXT,
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reasonsPositive" TEXT NOT NULL,
    "reasonsNegative" TEXT NOT NULL,
    "missingFields" TEXT NOT NULL,
    "redFlags" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "alertChannel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_profileId_listingId_key" ON "Match"("profileId", "listingId");
