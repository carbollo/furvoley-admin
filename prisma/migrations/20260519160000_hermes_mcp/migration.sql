-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "hermesMcpApiKey" TEXT;

-- CreateTable
CREATE TABLE "HermesMcpAuditLog" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argsSummary" TEXT NOT NULL,
    "memberId" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'hermes-mcp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HermesMcpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HermesMcpAuditLog_createdAt_idx" ON "HermesMcpAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "HermesMcpAuditLog_toolName_idx" ON "HermesMcpAuditLog"("toolName");
