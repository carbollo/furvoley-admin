-- Temporada por equipo y origen de eventos (calendario auto WD-2)

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "seasonStartDate" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "seasonEndDate" TIMESTAMP(3);

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';
