-- Idempotency guard of the offline outbox (likes / comments / messages sent later, possibly twice). Additive and idempotent.

CREATE TABLE IF NOT EXISTS "ClientRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientRequest_userId_clientId_key" ON "ClientRequest"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "ClientRequest_createdAt_idx" ON "ClientRequest"("createdAt");
