CREATE TABLE IF NOT EXISTS "ChatRoomFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoomFavorite_userId_roomId_key" ON "ChatRoomFavorite"("userId", "roomId");
CREATE INDEX IF NOT EXISTS "ChatRoomFavorite_userId_idx" ON "ChatRoomFavorite"("userId");

ALTER TABLE "ChatRoomFavorite" ADD CONSTRAINT "ChatRoomFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomFavorite" ADD CONSTRAINT "ChatRoomFavorite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
