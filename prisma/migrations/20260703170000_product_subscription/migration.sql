-- AlterTable
ALTER TABLE "Product" ADD COLUMN "billingPeriod" TEXT;
ALTER TABLE "Product" ADD COLUMN "subscriptionPlanId" TEXT;

-- Los antiguos productos "de evento" pasan a pago único (tipos: ONE_TIME | SUBSCRIPTION)
UPDATE "Product" SET "type" = 'ONE_TIME' WHERE "type" = 'EVENT';
