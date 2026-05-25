-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "hermesModelProvider" TEXT NOT NULL DEFAULT 'ollama-cloud';
ALTER TABLE "ClubSettings" ADD COLUMN "hermesDeepseekApiKey" TEXT;
ALTER TABLE "ClubSettings" ADD COLUMN "hermesDeepseekModel" TEXT DEFAULT 'deepseek-chat';
