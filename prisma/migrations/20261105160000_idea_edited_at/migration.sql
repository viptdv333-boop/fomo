-- The time of the author's last edit of a post (shown on the cards as «обновлено»). Additive and idempotent.

ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
