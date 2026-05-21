-- AlterTable
ALTER TABLE "Member" ADD COLUMN "registrationExtra" JSONB;

-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "registrationFieldsConfig" JSONB;
