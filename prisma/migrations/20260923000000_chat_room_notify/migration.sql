CREATE TABLE IF NOT EXISTS "ChatRoomNotify" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "ChatRoomNotify_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoomNotify_userId_roomId_key" ON "ChatRoomNotify"("userId", "roomId");
CREATE INDEX IF NOT EXISTS "ChatRoomNotify_roomId_idx" ON "ChatRoomNotify"("roomId");

ALTER TABLE "ChatRoomNotify" ADD CONSTRAINT "ChatRoomNotify_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomNotify" ADD CONSTRAINT "ChatRoomNotify_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
