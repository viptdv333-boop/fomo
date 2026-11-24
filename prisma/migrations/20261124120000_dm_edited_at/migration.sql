-- The time of the sender's last edit of a personal message (the app shows «изменено»). Additive and idempotent.

ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
