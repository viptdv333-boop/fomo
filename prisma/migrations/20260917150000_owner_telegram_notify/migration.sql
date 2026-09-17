ALTER TABLE "SubscriptionTariff" ADD COLUMN IF NOT EXISTS "authorTelegramNotify" BOOLEAN NOT NULL DEFAULT false;
