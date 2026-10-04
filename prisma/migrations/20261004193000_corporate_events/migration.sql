-- Corporate events cache of the economic calendar (dividends, bond coupons, reporting dates). Additive and idempotent.

CREATE TABLE IF NOT EXISTS "CorporateEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CorporateEvent_kind_date_idx" ON "CorporateEvent"("kind", "date");
CREATE INDEX IF NOT EXISTS "CorporateEvent_ticker_idx" ON "CorporateEvent"("ticker");
