-- Lead capture, tutor fields, team schedules, club holidays (PROCLUB workflows)

ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "guardianName" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT;

CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "sportPreference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberId" TEXT,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TeamSchedule" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "title" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,
    CONSTRAINT "TeamSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClubHoliday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubHoliday_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamSchedule" ADD CONSTRAINT "TeamSchedule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TeamSchedule_teamId_weekday_idx" ON "TeamSchedule"("teamId", "weekday");
