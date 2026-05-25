-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "hermesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClubSettings" ADD COLUMN "hermesOllamaApiKey" TEXT;
ALTER TABLE "ClubSettings" ADD COLUMN "hermesOllamaModel" TEXT DEFAULT 'gpt-oss:120b';
ALTER TABLE "ClubSettings" ADD COLUMN "hermesWhatsappMode" TEXT DEFAULT 'bot';
ALTER TABLE "ClubSettings" ADD COLUMN "hermesAllowedUsers" JSONB;
ALTER TABLE "ClubSettings" ADD COLUMN "hermesAllowDestructive" BOOLEAN NOT NULL DEFAULT false;
