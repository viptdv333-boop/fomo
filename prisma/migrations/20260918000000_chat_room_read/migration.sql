CREATE TABLE IF NOT EXISTS "ChatRoomRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoomRead_userId_roomId_key" ON "ChatRoomRead"("userId", "roomId");
CREATE INDEX IF NOT EXISTS "ChatRoomRead_userId_idx" ON "ChatRoomRead"("userId");

ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
