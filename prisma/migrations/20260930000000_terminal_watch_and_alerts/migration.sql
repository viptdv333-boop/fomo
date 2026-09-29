CREATE TABLE IF NOT EXISTS "TerminalWatchItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "dataTicker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerminalWatchItem_userId_source_dataTicker_key" ON "TerminalWatchItem"("userId", "source", "dataTicker");
CREATE INDEX IF NOT EXISTS "TerminalWatchItem_userId_idx" ON "TerminalWatchItem"("userId");

DO $$ BEGIN
  ALTER TABLE "TerminalWatchItem" ADD CONSTRAINT "TerminalWatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dataTicker" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'price',
    "condition" TEXT NOT NULL DEFAULT 'cross',
    "price" DOUBLE PRECISION,
    "line" JSONB,
    "message" TEXT,
    "repeat" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSide" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "triggeredAt" TIMESTAMP(3),
    "lastTriggerAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PriceAlert_userId_status_idx" ON "PriceAlert"("userId", "status");
CREATE INDEX IF NOT EXISTS "PriceAlert_status_source_dataTicker_idx" ON "PriceAlert"("status", "source", "dataTicker");

DO $$ BEGIN
  ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
