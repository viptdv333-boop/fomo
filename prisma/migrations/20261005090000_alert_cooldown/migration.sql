-- Terminal alerts: per-alert cooldown (minutes) between two firings of a repeating alert. Additive and idempotent.
-- Existing rows get 1 minute = the fixed cooldown they had before.

ALTER TABLE "PriceAlert" ADD COLUMN IF NOT EXISTS "cooldownMin" INTEGER NOT NULL DEFAULT 1;
