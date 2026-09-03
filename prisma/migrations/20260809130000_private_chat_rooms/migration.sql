-- User-creatable private chat rooms, joinable only via invite link.
-- ownerId/inviteToken stay NULL on every existing room (general topic
-- rooms and paid-channel rooms), which keeps their current access
-- behavior (open / Subscription-derived) untouched.

ALTER TABLE "ChatRoom"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerId" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoom_inviteToken_key" ON "ChatRoom"("inviteToken");
CREATE INDEX IF NOT EXISTS "ChatRoom_ownerId_idx" ON "ChatRoom"("ownerId");

ALTER TABLE "ChatRoom"
  ADD CONSTRAINT "ChatRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Membership for user-created private rooms only (ChatRoom.ownerId != null).
CREATE TABLE IF NOT EXISTS "ChatRoomMember" (
    "id"       TEXT NOT NULL,
    "roomId"   TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "role"     TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoomMember_roomId_userId_key" ON "ChatRoomMember"("roomId", "userId");
CREATE INDEX IF NOT EXISTS "ChatRoomMember_userId_idx" ON "ChatRoomMember"("userId");

ALTER TABLE "ChatRoomMember"
  ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
