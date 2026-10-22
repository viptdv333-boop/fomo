-- Тарифные планы канала: SubscriptionTariff.parentId (план -> канал), planName (название плана корня),
-- archivedAt (канал закрыт владельцем, строка сохраняется, чтобы посты остались закрытыми).
-- Идемпотентно: можно применять повторно. Существующие строки остаются каналами (parentId = NULL).

ALTER TABLE "SubscriptionTariff" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "SubscriptionTariff" ADD COLUMN IF NOT EXISTS "planName" TEXT;
ALTER TABLE "SubscriptionTariff" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SubscriptionTariff_parentId_idx" ON "SubscriptionTariff"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionTariff_parentId_fkey') THEN
    ALTER TABLE "SubscriptionTariff"
      ADD CONSTRAINT "SubscriptionTariff_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "SubscriptionTariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
