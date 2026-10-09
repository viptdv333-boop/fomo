-- Terminal setup batches of the trading bot (Idea.botSetupTicker / botSetupBatchAt, see docs/bot-setup-batches.md). Additive and idempotent.

ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "botSetupTicker" TEXT;
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "botSetupBatchAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Idea_authorId_tariffId_botSetupTicker_createdAt_idx" ON "Idea"("authorId", "tariffId", "botSetupTicker", "createdAt");
