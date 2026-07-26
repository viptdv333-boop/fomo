-- Closes the openings found in the account-security review:
--   * verification codes had unlimited guesses inside their 15-minute life
--   * login had no attempt ceiling at all
--   * changing a password left every existing session valid

-- Wrong guesses against a code; the code is burned once this hits the cap.
ALTER TABLE "EmailVerification"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Bumped on every password change so old sessions stop validating.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Fixed-window counters for logins, code guesses, sign-ups per IP and posting
-- frequency. Postgres instead of Redis: one less service, and the volumes here
-- are nowhere near where that trade-off flips.
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key"       TEXT NOT NULL,
    "count"     INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
