-- CreateEnum
CREATE TYPE "CommanderReason" AS ENUM ('OK', 'NO_WALLET', 'UNVERIFIED_EMAIL', 'INACTIVE_ACCOUNT', 'BELOW_THRESHOLD', 'CHAIN_READ_ERROR');

-- CreateTable
CREATE TABLE "CommanderStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "isCommander" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEligibleAt" TIMESTAMP(3),
    "lastIneligibleAt" TIMESTAMP(3),
    "balanceAtomic" TEXT NOT NULL DEFAULT '0',
    "requiredThresholdUsd" TEXT NOT NULL DEFAULT '500',
    "reason" "CommanderReason" NOT NULL DEFAULT 'NO_WALLET',

    CONSTRAINT "CommanderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommanderStatus_isCommander_idx" ON "CommanderStatus"("isCommander");

-- CreateIndex
CREATE INDEX "CommanderStatus_lastCheckedAt_idx" ON "CommanderStatus"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommanderStatus_userId_chainId_address_key" ON "CommanderStatus"("userId", "chainId", "address");

-- AddForeignKey
ALTER TABLE "CommanderStatus" ADD CONSTRAINT "CommanderStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
