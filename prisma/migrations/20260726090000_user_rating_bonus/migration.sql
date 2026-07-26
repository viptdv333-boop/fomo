-- Manual admin rating adjustments used to be written straight into "rating",
-- where the next recalculation (publish, vote, follow) overwrote them. Keep
-- them in their own column so the formula can add them back every time.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "ratingBonus" DECIMAL(4,2) NOT NULL DEFAULT 0;
