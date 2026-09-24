CREATE TABLE IF NOT EXISTS "FeedMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedAuthorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeedMute_userId_mutedAuthorId_key" ON "FeedMute"("userId", "mutedAuthorId");
CREATE INDEX IF NOT EXISTS "FeedMute_userId_idx" ON "FeedMute"("userId");

ALTER TABLE "FeedMute" ADD CONSTRAINT "FeedMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedMute" ADD CONSTRAINT "FeedMute_mutedAuthorId_fkey" FOREIGN KEY ("mutedAuthorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
