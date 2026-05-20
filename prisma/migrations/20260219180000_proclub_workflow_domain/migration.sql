-- PROCLUB: tokens de respuesta y dominios deportivo/cobros

CREATE TABLE IF NOT EXISTS "WorkflowResponseToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "memberId" TEXT,
  "eventId" TEXT,
  "teamId" TEXT,
  "payload" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowResponseToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowResponseToken_token_key" ON "WorkflowResponseToken"("token");
CREATE INDEX IF NOT EXISTS "WorkflowResponseToken_type_expiresAt_idx" ON "WorkflowResponseToken"("type", "expiresAt");

CREATE TABLE IF NOT EXISTS "EventConvocation" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventConvocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventConvocation_eventId_memberId_key" ON "EventConvocation"("eventId", "memberId");
CREATE INDEX IF NOT EXISTS "EventConvocation_eventId_idx" ON "EventConvocation"("eventId");

CREATE TABLE IF NOT EXISTS "TeamChangeRequest" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "fromTeamId" TEXT,
  "toTeamId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeamChangeRequest_memberId_idx" ON "TeamChangeRequest"("memberId");
CREATE INDEX IF NOT EXISTS "TeamChangeRequest_status_idx" ON "TeamChangeRequest"("status");

CREATE TABLE IF NOT EXISTS "CoachSubstitution" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "originalCoachId" TEXT,
  "substituteCoachId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachSubstitution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CoachSubstitution_eventId_idx" ON "CoachSubstitution"("eventId");

CREATE TABLE IF NOT EXISTS "MemberDocument" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MemberDocument_memberId_idx" ON "MemberDocument"("memberId");
CREATE INDEX IF NOT EXISTS "MemberDocument_expiresAt_idx" ON "MemberDocument"("expiresAt");

CREATE TABLE IF NOT EXISTS "PlayerEvaluation" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "teamId" TEXT,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlayerEvaluation_memberId_idx" ON "PlayerEvaluation"("memberId");

CREATE TABLE IF NOT EXISTS "CoachIncident" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "resolution" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DiscountRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemberCreditBalance" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberCreditBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MemberCreditBalance_memberId_key" ON "MemberCreditBalance"("memberId");
