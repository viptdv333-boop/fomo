CREATE TABLE IF NOT EXISTS "TerminalUserData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminalUserData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerminalUserData_userId_kind_key_key" ON "TerminalUserData"("userId", "kind", "key");
CREATE INDEX IF NOT EXISTS "TerminalUserData_userId_kind_idx" ON "TerminalUserData"("userId", "kind");

DO $$ BEGIN
  ALTER TABLE "TerminalUserData" ADD CONSTRAINT "TerminalUserData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
