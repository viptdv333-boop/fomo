-- Посты закрытых каналов (13.09.2026).
-- Idea.tariffId — идея принадлежит каналу: видна в нём и открывается подпиской
-- на этот канал. Подписка — на канал, а не на автора целиком: уникальность
-- (subscriberId, authorId) снята, у читателя может быть несколько каналов одного
-- автора. Новый уникальный ключ не вводится намеренно: деплой применяет схему
-- через `prisma db push`, а добавление уникального ключа он считает возможной
-- потерей данных и без --accept-data-loss останавливает запуск.

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN "tariffId" TEXT;

-- CreateIndex
CREATE INDEX "Idea_tariffId_idx" ON "Idea"("tariffId");

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "SubscriptionTariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Subscription_subscriberId_authorId_key";

-- CreateIndex
CREATE INDEX "Subscription_subscriberId_authorId_idx" ON "Subscription"("subscriberId", "authorId");

-- CreateIndex
CREATE INDEX "Subscription_subscriberId_tariffId_idx" ON "Subscription"("subscriberId", "tariffId");
