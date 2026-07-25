-- Rating had no base value: a new author summed to 0 and clamped to the
-- floor (1.0), so publishing a first idea dropped their rating instead of
-- raising it. Add a base plus a capped reward for publishing.
ALTER TABLE "RatingConfig" ADD COLUMN IF NOT EXISTS "baseRating"   DECIMAL(5,3) NOT NULL DEFAULT 3.0;
ALTER TABLE "RatingConfig" ADD COLUMN IF NOT EXISTS "ideaWeight"   DECIMAL(5,3) NOT NULL DEFAULT 0.05;
ALTER TABLE "RatingConfig" ADD COLUMN IF NOT EXISTS "ideaBonusCap" DECIMAL(5,3) NOT NULL DEFAULT 2.0;
