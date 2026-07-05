-- CreateEnum
CREATE TYPE "CommunityTeam" AS ENUM ('USER_MANAGEMENT', 'DAO_COUNCIL', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "TeamElectionType" AS ENUM ('USER_MANAGEMENT', 'DAO_COUNCIL');

-- CreateEnum
CREATE TYPE "TeamElectionStatus" AS ENUM ('DRAFT', 'NOMINATIONS_OPEN', 'VOTING_OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ElectionCandidateStatus" AS ENUM ('SUBMITTED', 'ELIGIBLE', 'WITHDRAWN', 'ELECTED', 'NOT_ELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('VISIBLE', 'TEMPORARILY_HIDDEN', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ModerationCaseStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REVOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentModerationActionType" AS ENUM ('TEMPORARILY_HIDE', 'RESTORE', 'CONFIRM_HIDE', 'REJECT_HIDE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisciplinaryCaseType" AS ENUM ('SUSPENSION', 'REINSTATEMENT');

-- CreateEnum
CREATE TYPE "DisciplinaryCaseStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisciplinaryVote" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('SUBMITTED', 'COMMANDER_REVIEW', 'SELECTED', 'IN_DEVELOPMENT', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectRecommendation" AS ENUM ('SUPPORT', 'NEUTRAL', 'OPPOSE');

-- CreateEnum
CREATE TYPE "ProjectEvaluationTeam" AS ENUM ('USER_MANAGEMENT', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'TEAM_MEMBERSHIP', 'TEAM_ELECTION', 'TEAM_CANDIDACY', 'POST', 'COMMENT', 'MODERATION_CASE', 'REPORT', 'DISCIPLINARY_CASE', 'PROJECT', 'PROTOCOL_SERVICE', 'SESSION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProtocolServiceType" AS ENUM ('ORACLE', 'DEX', 'RPC_PROVIDER', 'DATA_PROVIDER', 'BRIDGE', 'AUTOMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProtocolServiceProposalStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'TECHNICALLY_APPROVED', 'TECHNICALLY_REJECTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'RETIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GovernanceVote" AS ENUM ('APPROVE', 'REJECT');

-- AlterTable
-- The temporary default safely initializes existing rows.
ALTER TABLE "Comment" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "ContentVisibility" NOT NULL DEFAULT 'VISIBLE',
ADD COLUMN     "visibilityReason" TEXT;

ALTER TABLE "Comment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
-- The temporary default safely initializes existing rows.
ALTER TABLE "Post" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "ContentVisibility" NOT NULL DEFAULT 'VISIBLE',
ADD COLUMN     "visibilityReason" TEXT;

ALTER TABLE "Post" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CommunityTeamMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" "CommunityTeam" NOT NULL,
    "appointedById" TEXT,
    "sourceElectionId" TEXT,
    "appointedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termStartsAt" TIMESTAMP(3),
    "termEndsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "CommunityTeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamElection" (
    "id" TEXT NOT NULL,
    "type" "TeamElectionType" NOT NULL,
    "status" "TeamElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "electorateCount" INTEGER NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "maximumPercentBps" INTEGER NOT NULL DEFAULT 2000,
    "bootstrapMinimum" INTEGER NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "runoffSeatCount" INTEGER,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "termStartsAt" TIMESTAMP(3),
    "termEndsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamElection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamElectionCandidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "nominatedById" TEXT,
    "statement" TEXT NOT NULL,
    "status" "ElectionCandidateStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TeamElectionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamElectionVote" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamElectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "outcome" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentModerationCase" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ContentModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentModerationAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ContentModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetPostId" TEXT,
    "targetCommentId" TEXT,
    "targetProjectId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDisciplinaryCase" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "sourceReportId" TEXT,
    "type" "DisciplinaryCaseType" NOT NULL,
    "status" "DisciplinaryCaseStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 3,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "UserDisciplinaryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDisciplinaryVote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" "DisciplinaryVote" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDisciplinaryVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityProject" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sourcePostId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityProjectLike" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityProjectLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommanderProjectReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "recommendation" "ProjectRecommendation" NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommanderProjectReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTeamEvaluation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "team" "ProjectEvaluationTeam" NOT NULL,
    "recommendation" "ProjectRecommendation" NOT NULL,
    "utilityScore" INTEGER,
    "qualityScore" INTEGER,
    "impactScore" INTEGER,
    "feasibilityScore" INTEGER,
    "sustainabilityScore" INTEGER,
    "integrationScore" INTEGER,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTeamEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "ProjectStatus",
    "toStatus" "ProjectStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolServiceProposal" (
    "id" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "serviceType" "ProtocolServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "endpoint" TEXT,
    "status" "ProtocolServiceProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requiredApprovals" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ProtocolServiceProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolServiceVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" "GovernanceVote" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtocolServiceVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityTeamMembership_team_endedAt_idx" ON "CommunityTeamMembership"("team", "endedAt");

-- CreateIndex
CREATE INDEX "CommunityTeamMembership_appointedById_idx" ON "CommunityTeamMembership"("appointedById");

-- CreateIndex
CREATE INDEX "CommunityTeamMembership_sourceElectionId_idx" ON "CommunityTeamMembership"("sourceElectionId");

-- CreateIndex
CREATE INDEX "CommunityTeamMembership_termEndsAt_idx" ON "CommunityTeamMembership"("termEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTeamMembership_userId_team_key" ON "CommunityTeamMembership"("userId", "team");

-- CreateIndex
CREATE INDEX "TeamElection_type_status_idx" ON "TeamElection"("type", "status");

-- CreateIndex
CREATE INDEX "TeamElection_opensAt_closesAt_idx" ON "TeamElection"("opensAt", "closesAt");

-- CreateIndex
CREATE INDEX "TeamElection_createdById_idx" ON "TeamElection"("createdById");

-- CreateIndex
CREATE INDEX "TeamElectionCandidate_electionId_status_idx" ON "TeamElectionCandidate"("electionId", "status");

-- CreateIndex
CREATE INDEX "TeamElectionCandidate_candidateId_submittedAt_idx" ON "TeamElectionCandidate"("candidateId", "submittedAt");

-- CreateIndex
CREATE INDEX "TeamElectionCandidate_nominatedById_idx" ON "TeamElectionCandidate"("nominatedById");

-- CreateIndex
CREATE UNIQUE INDEX "TeamElectionCandidate_electionId_candidateId_key" ON "TeamElectionCandidate"("electionId", "candidateId");

-- CreateIndex
CREATE INDEX "TeamElectionVote_electionId_voterId_round_idx" ON "TeamElectionVote"("electionId", "voterId", "round");

-- CreateIndex
CREATE INDEX "TeamElectionVote_electionId_round_idx" ON "TeamElectionVote"("electionId", "round");

-- CreateIndex
CREATE INDEX "TeamElectionVote_voterId_createdAt_idx" ON "TeamElectionVote"("voterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamElectionVote_candidateId_voterId_round_key" ON "TeamElectionVote"("candidateId", "voterId", "round");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ContentModerationCase_postId_idx" ON "ContentModerationCase"("postId");

-- CreateIndex
CREATE INDEX "ContentModerationCase_commentId_idx" ON "ContentModerationCase"("commentId");

-- CreateIndex
CREATE INDEX "ContentModerationCase_status_openedAt_idx" ON "ContentModerationCase"("status", "openedAt");

-- CreateIndex
CREATE INDEX "ContentModerationCase_openedById_idx" ON "ContentModerationCase"("openedById");

-- CreateIndex
CREATE INDEX "ContentModerationAction_caseId_createdAt_idx" ON "ContentModerationAction"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentModerationAction_actorId_createdAt_idx" ON "ContentModerationAction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_reporterId_createdAt_idx" ON "CommunityReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_status_createdAt_idx" ON "CommunityReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_targetUserId_idx" ON "CommunityReport"("targetUserId");

-- CreateIndex
CREATE INDEX "CommunityReport_targetPostId_idx" ON "CommunityReport"("targetPostId");

-- CreateIndex
CREATE INDEX "CommunityReport_targetCommentId_idx" ON "CommunityReport"("targetCommentId");

-- CreateIndex
CREATE INDEX "CommunityReport_targetProjectId_idx" ON "CommunityReport"("targetProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDisciplinaryCase_sourceReportId_key" ON "UserDisciplinaryCase"("sourceReportId");

-- CreateIndex
CREATE INDEX "UserDisciplinaryCase_subjectUserId_status_idx" ON "UserDisciplinaryCase"("subjectUserId", "status");

-- CreateIndex
CREATE INDEX "UserDisciplinaryCase_status_openedAt_idx" ON "UserDisciplinaryCase"("status", "openedAt");

-- CreateIndex
CREATE INDEX "UserDisciplinaryCase_openedById_idx" ON "UserDisciplinaryCase"("openedById");

-- CreateIndex
CREATE INDEX "UserDisciplinaryVote_voterId_createdAt_idx" ON "UserDisciplinaryVote"("voterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDisciplinaryVote_caseId_voterId_key" ON "UserDisciplinaryVote"("caseId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityProject_sourcePostId_key" ON "CommunityProject"("sourcePostId");

-- CreateIndex
CREATE INDEX "CommunityProject_authorId_submittedAt_idx" ON "CommunityProject"("authorId", "submittedAt");

-- CreateIndex
CREATE INDEX "CommunityProject_status_submittedAt_idx" ON "CommunityProject"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "CommunityProjectLike_userId_createdAt_idx" ON "CommunityProjectLike"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityProjectLike_projectId_userId_key" ON "CommunityProjectLike"("projectId", "userId");

-- CreateIndex
CREATE INDEX "CommanderProjectReview_reviewerId_createdAt_idx" ON "CommanderProjectReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommanderProjectReview_projectId_reviewerId_key" ON "CommanderProjectReview"("projectId", "reviewerId");

-- CreateIndex
CREATE INDEX "ProjectTeamEvaluation_projectId_team_idx" ON "ProjectTeamEvaluation"("projectId", "team");

-- CreateIndex
CREATE INDEX "ProjectTeamEvaluation_reviewerId_createdAt_idx" ON "ProjectTeamEvaluation"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTeamEvaluation_projectId_reviewerId_team_key" ON "ProjectTeamEvaluation"("projectId", "reviewerId", "team");

-- CreateIndex
CREATE INDEX "ProjectStatusHistory_projectId_createdAt_idx" ON "ProjectStatusHistory"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectStatusHistory_actorId_createdAt_idx" ON "ProjectStatusHistory"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ProtocolServiceProposal_status_createdAt_idx" ON "ProtocolServiceProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProtocolServiceProposal_serviceType_status_idx" ON "ProtocolServiceProposal"("serviceType", "status");

-- CreateIndex
CREATE INDEX "ProtocolServiceProposal_proposerId_createdAt_idx" ON "ProtocolServiceProposal"("proposerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProtocolServiceVote_voterId_createdAt_idx" ON "ProtocolServiceVote"("voterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolServiceVote_proposalId_voterId_key" ON "ProtocolServiceVote"("proposalId", "voterId");

-- CreateIndex
CREATE INDEX "CommanderStatus_userId_isCommander_idx" ON "CommanderStatus"("userId", "isCommander");

-- CreateIndex
CREATE INDEX "Comment_visibility_createdAt_idx" ON "Comment"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Post_visibility_createdAt_idx" ON "Post"("visibility", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunityTeamMembership" ADD CONSTRAINT "CommunityTeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTeamMembership" ADD CONSTRAINT "CommunityTeamMembership_appointedById_fkey" FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTeamMembership" ADD CONSTRAINT "CommunityTeamMembership_sourceElectionId_fkey" FOREIGN KEY ("sourceElectionId") REFERENCES "TeamElection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElection" ADD CONSTRAINT "TeamElection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionCandidate" ADD CONSTRAINT "TeamElectionCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "TeamElection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionCandidate" ADD CONSTRAINT "TeamElectionCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionCandidate" ADD CONSTRAINT "TeamElectionCandidate_nominatedById_fkey" FOREIGN KEY ("nominatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionVote" ADD CONSTRAINT "TeamElectionVote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "TeamElection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionVote" ADD CONSTRAINT "TeamElectionVote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TeamElectionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamElectionVote" ADD CONSTRAINT "TeamElectionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationCase" ADD CONSTRAINT "ContentModerationCase_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationCase" ADD CONSTRAINT "ContentModerationCase_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationCase" ADD CONSTRAINT "ContentModerationCase_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationCase" ADD CONSTRAINT "ContentModerationCase_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationAction" ADD CONSTRAINT "ContentModerationAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ContentModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentModerationAction" ADD CONSTRAINT "ContentModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetPostId_fkey" FOREIGN KEY ("targetPostId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetCommentId_fkey" FOREIGN KEY ("targetCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "CommunityProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryCase" ADD CONSTRAINT "UserDisciplinaryCase_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryCase" ADD CONSTRAINT "UserDisciplinaryCase_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryCase" ADD CONSTRAINT "UserDisciplinaryCase_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryCase" ADD CONSTRAINT "UserDisciplinaryCase_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "CommunityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryVote" ADD CONSTRAINT "UserDisciplinaryVote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "UserDisciplinaryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisciplinaryVote" ADD CONSTRAINT "UserDisciplinaryVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityProject" ADD CONSTRAINT "CommunityProject_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityProject" ADD CONSTRAINT "CommunityProject_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityProjectLike" ADD CONSTRAINT "CommunityProjectLike_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CommunityProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityProjectLike" ADD CONSTRAINT "CommunityProjectLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommanderProjectReview" ADD CONSTRAINT "CommanderProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CommunityProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommanderProjectReview" ADD CONSTRAINT "CommanderProjectReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamEvaluation" ADD CONSTRAINT "ProjectTeamEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CommunityProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamEvaluation" ADD CONSTRAINT "ProjectTeamEvaluation_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusHistory" ADD CONSTRAINT "ProjectStatusHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CommunityProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusHistory" ADD CONSTRAINT "ProjectStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolServiceProposal" ADD CONSTRAINT "ProtocolServiceProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolServiceVote" ADD CONSTRAINT "ProtocolServiceVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ProtocolServiceProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolServiceVote" ADD CONSTRAINT "ProtocolServiceVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

