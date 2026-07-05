import type { Prisma } from "@prisma/client";

import { prisma } from "../shared/prisma.js";

function activeMembershipWhere(
  currentDate: Date
): Prisma.CommunityTeamMembershipWhereInput {
  return {
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
  };
}

async function countCurrentCommanders() {
  const statuses =
    await prisma.commanderStatus.findMany({
      where: {
        user: {
          status: "ACTIVE",
        },
      },
      orderBy: {
        lastCheckedAt: "desc",
      },
      select: {
        userId: true,
        isCommander: true,
      },
    });

  const latestState =
    new Map<string, boolean>();

  for (const status of statuses) {
    if (!latestState.has(status.userId)) {
      latestState.set(
        status.userId,
        status.isCommander
      );
    }
  }

  return Array.from(
    latestState.values()
  ).filter(Boolean).length;
}

export async function getControlPanelDashboard() {
  const currentDate = new Date();

  const [
    totalUsers,
    activeUsers,
    pendingUsers,
    suspendedUsers,
    commanders,

    userManagementMembers,
    daoCouncilMembers,
    developmentMembers,

    totalBoards,
    totalPosts,
    visiblePosts,
    temporarilyHiddenPosts,
    hiddenPosts,

    totalComments,
    visibleComments,
    temporarilyHiddenComments,
    hiddenComments,

    totalProjects,
    submittedProjects,
    selectedProjects,
    projectsInDevelopment,
    completedProjects,

    openModerationCases,
    openReports,
    openDisciplinaryCases,

    activeElections,
    protocolProposalsUnderReview,
    activeProtocolServices,
  ] = await Promise.all([
    prisma.user.count(),

    prisma.user.count({
      where: {
        status: "ACTIVE",
      },
    }),

    prisma.user.count({
      where: {
        status: "PENDING",
      },
    }),

    prisma.user.count({
      where: {
        status: "SUSPENDED",
      },
    }),

    countCurrentCommanders(),

    prisma.communityTeamMembership.count({
      where: {
        team: "USER_MANAGEMENT",
        ...activeMembershipWhere(
          currentDate
        ),
      },
    }),

    prisma.communityTeamMembership.count({
      where: {
        team: "DAO_COUNCIL",
        ...activeMembershipWhere(
          currentDate
        ),
      },
    }),

    prisma.communityTeamMembership.count({
      where: {
        team: "DEVELOPMENT",
        ...activeMembershipWhere(
          currentDate
        ),
      },
    }),

    prisma.board.count(),
    prisma.post.count(),

    prisma.post.count({
      where: {
        visibility: "VISIBLE",
      },
    }),

    prisma.post.count({
      where: {
        visibility:
          "TEMPORARILY_HIDDEN",
      },
    }),

    prisma.post.count({
      where: {
        visibility: "HIDDEN",
      },
    }),

    prisma.comment.count(),

    prisma.comment.count({
      where: {
        visibility: "VISIBLE",
      },
    }),

    prisma.comment.count({
      where: {
        visibility:
          "TEMPORARILY_HIDDEN",
      },
    }),

    prisma.comment.count({
      where: {
        visibility: "HIDDEN",
      },
    }),

    prisma.communityProject.count(),

    prisma.communityProject.count({
      where: {
        status: "SUBMITTED",
      },
    }),

    prisma.communityProject.count({
      where: {
        status: "SELECTED",
      },
    }),

    prisma.communityProject.count({
      where: {
        status:
          "IN_DEVELOPMENT",
      },
    }),

    prisma.communityProject.count({
      where: {
        status: "COMPLETED",
      },
    }),

    prisma.contentModerationCase.count({
      where: {
        status: "OPEN",
      },
    }),

    prisma.communityReport.count({
      where: {
        status: {
          in: [
            "OPEN",
            "UNDER_REVIEW",
            "ESCALATED",
          ],
        },
      },
    }),

    prisma.userDisciplinaryCase.count({
      where: {
        status: "OPEN",
      },
    }),

    prisma.teamElection.count({
      where: {
        status: {
          in: [
            "DRAFT",
            "NOMINATIONS_OPEN",
            "VOTING_OPEN",
            "CLOSED",
          ],
        },
      },
    }),

    prisma.protocolServiceProposal.count({
      where: {
        status: {
          in: [
            "SUBMITTED",
            "UNDER_REVIEW",
            "APPROVED",
            "TECHNICALLY_APPROVED",
          ],
        },
      },
    }),

    prisma.protocolServiceProposal.count({
      where: {
        status: "ACTIVE",
      },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      pending: pendingUsers,
      suspended: suspendedUsers,
    },

    governance: {
      commanders,
      userManagementMembers,
      daoCouncilMembers,
      developmentMembers,
      activeElections,
    },

    community: {
      boards: totalBoards,

      posts: {
        total: totalPosts,
        visible: visiblePosts,
        temporarilyHidden:
          temporarilyHiddenPosts,
        hidden: hiddenPosts,
      },

      comments: {
        total: totalComments,
        visible: visibleComments,
        temporarilyHidden:
          temporarilyHiddenComments,
        hidden: hiddenComments,
      },
    },

    projects: {
      total: totalProjects,
      submitted: submittedProjects,
      selected: selectedProjects,
      inDevelopment:
        projectsInDevelopment,
      completed: completedProjects,
    },

    controlPanel: {
      openModerationCases,
      openReports,
      openDisciplinaryCases,
    },

    protocol: {
      proposalsUnderReview:
        protocolProposalsUnderReview,
      activeServices:
        activeProtocolServices,
    },
  };
}