-- AlterTable
ALTER TABLE "Member" ADD COLUMN "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN "billingDayOfMonth" INTEGER NOT NULL DEFAULT 1;
