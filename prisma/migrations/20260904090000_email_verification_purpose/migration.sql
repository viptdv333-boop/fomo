-- Closes a structural gap found while auditing the register-route account-
-- takeover bug: EmailVerification had no way to tell which flow a code was
-- issued for, so consumeCode() matched on email+code alone. Every call site
-- happened to add its own extra pre-check that made this safe today, but
-- nothing in the shared primitive actually enforced it. Give each code a
-- purpose and let consumeCode() require an exact match.

ALTER TABLE "EmailVerification"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'register';
