import type { User } from "@prisma/client";

import { prisma } from "../shared/prisma.js";
import {
  buildCommunityPermissions,
  type CommunityTeamName,
} from "../shared/permissions.js";

export async function getCommunityAccess(
  user: Pick<User, "id" | "role">
) {
  const currentDate = new Date();

  const [commanderStatus, memberships] =
    await Promise.all([
      prisma.commanderStatus.findFirst({
        where: {
          userId: user.id,
        },
        orderBy: {
          lastCheckedAt: "desc",
        },
        select: {
          isCommander: true,
          reason: true,
          balanceAtomic: true,
          requiredThresholdUsd: true,
          lastCheckedAt: true,
          lastEligibleAt: true,
          lastIneligibleAt: true,
          chainId: true,
          address: true,
        },
      }),

      prisma.communityTeamMembership.findMany({
        where: {
          userId: user.id,
          endedAt: null,

          AND: [
            {
              OR: [
                {
                  termStartsAt: null,
                },
                {
                  termStartsAt: {
                    lte: currentDate,
                  },
                },
              ],
            },
            {
              OR: [
                {
                  termEndsAt: null,
                },
                {
                  termEndsAt: {
                    gt: currentDate,
                  },
                },
              ],
            },
          ],
        },
        select: {
          team: true,
        },
      }),
    ]);

  const commander = commanderStatus ?? {
    isCommander: false,
    reason: "NO_WALLET" as const,
    balanceAtomic: "0",
    requiredThresholdUsd: "500",
    lastCheckedAt: null,
    lastEligibleAt: null,
    lastIneligibleAt: null,
    chainId: null,
    address: null,
  };

  const teams = memberships.map(
    (membership) =>
      membership.team as CommunityTeamName
  );

  return {
    commander,

    permissions:
      buildCommunityPermissions({
        role: user.role,
        isCommander:
          commander.isCommander,
        teams,
      }),
  };
}