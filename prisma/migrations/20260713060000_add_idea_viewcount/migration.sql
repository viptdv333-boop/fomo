-- Add real per-idea view counter. Idempotent so it can be applied on
-- deployments where the column was created via `prisma db push` earlier.
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
