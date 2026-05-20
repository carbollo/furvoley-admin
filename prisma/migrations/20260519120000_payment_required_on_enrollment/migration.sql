-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN "paymentRequiredOnEnrollment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "paymentRequiredOnEnrollment" BOOLEAN NOT NULL DEFAULT false;
