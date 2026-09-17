ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "telegramNotify" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "TelegramAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT,
    "chatId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramAccount_userId_key" ON "TelegramAccount"("userId");

ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
