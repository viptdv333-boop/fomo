-- Custom short public id for channels (SubscriptionTariff rows), same
-- charset/length rules as User.fomoId. Null falls back to the raw cuid.
ALTER TABLE "SubscriptionTariff" ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionTariff_slug_key" ON "SubscriptionTariff"("slug");
