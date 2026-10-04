-- Server-side reminders for economic-calendar events («колокольчик»): a notification of type "calendar_reminder"
-- goes out through the dispatcher `leadMin` minutes before the release. Additive and idempotent.

CREATE TABLE IF NOT EXISTS "CalendarReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTs" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "impact" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL DEFAULT 'other',
    "gk" TEXT,
    "leadMin" INTEGER NOT NULL DEFAULT 15,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarReminder_userId_eventId_leadMin_key" ON "CalendarReminder"("userId", "eventId", "leadMin");
CREATE INDEX IF NOT EXISTS "CalendarReminder_eventTs_idx" ON "CalendarReminder"("eventTs");
CREATE INDEX IF NOT EXISTS "CalendarReminder_userId_notifiedAt_idx" ON "CalendarReminder"("userId", "notifiedAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarReminder_userId_fkey') THEN
        ALTER TABLE "CalendarReminder" ADD CONSTRAINT "CalendarReminder_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
