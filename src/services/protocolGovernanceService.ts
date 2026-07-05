import type {
  GovernanceVote,
  Prisma,
  ProtocolServiceType,
  User,
} from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type GovernanceActor = Pick<
  User,
  "id" | "username"
>;

type TechnicalDecision =
  | "APPROVE"
  | "REJECT";

function createHttpError(
  message: string,
  statusCode: number
) {
  const error = new Error(message) as Error & {
    statusCode: number;
  };

  error.statusCode = statusCode;
  return error;
}

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

async function getLatestCommanderState(
  userId: string
) {
  const status =
    await prisma.commanderStatus.findFirst({
      where: {
        userId,
      },
      orderBy: {
        lastCheckedAt: "desc",
      },
      select: {
        isCommander: true,
      },
    });

  return status?.isCommander ?? false;
}

async function assertDaoCouncilMember(
  userId: string
) {
  const currentDate = new Date();

  const [
    daoMembership,
    userManagementMembership,
    isCommander,
  ] = await Promise.all([
    prisma.communityTeamMembership.findFirst({
      where: {
        userId,
        team: "DAO_COUNCIL",
        ...activeMembershipWhere(
          currentDate
        ),
      },
      select: {
        id: true,
      },
    }),

    prisma.communityTeamMembership.findFirst({
      where: {
        userId,
        team: "USER_MANAGEMENT",
        ...activeMembershipWhere(
          currentDate
        ),
      },
      select: {
        id: true,
      },
    }),

    getLatestCommanderState(userId),
  ]);

  if (
    !daoMembership ||
    !userManagementMembership ||
    !isCommander
  ) {
    throw createHttpError(
      "DAO_COUNCIL_MEMBERSHIP_REQUIRED",
      403
    );
  }
}

async function assertDevelopmentMember(
  userId: string
) {
  const currentDate = new Date();

  const membership =
    await prisma.communityTeamMembership.findFirst({
      where: {
        userId,
        team: "DEVELOPMENT",
        ...activeMembershipWhere(
          currentDate
        ),
      },
      select: {
        id: true,
      },
    });

  if (!membership) {
    throw createHttpError(
      "DEVELOPMENT_MEMBERSHIP_REQUIRED",
      403
    );
  }
}

async function getActiveDaoCouncilMemberIds() {
  const currentDate = new Date();

  const [
    daoMemberships,
    userManagementMemberships,
  ] = await Promise.all([
    prisma.communityTeamMembership.findMany({
      where: {
        team: "DAO_COUNCIL",
        ...activeMembershipWhere(
          currentDate
        ),
      },
      select: {
        userId: true,
      },
    }),

    prisma.communityTeamMembership.findMany({
      where: {
        team: "USER_MANAGEMENT",
        ...activeMembershipWhere(
          currentDate
        ),
      },
      select: {
        userId: true,
      },
    }),
  ]);

  const userManagementIds =
    new Set(
      userManagementMemberships.map(
        (membership) =>
          membership.userId
      )
    );

  const possibleDaoIds =
    daoMemberships
      .map(
        (membership) =>
          membership.userId
      )
      .filter((userId) =>
        userManagementIds.has(userId)
      );

  if (possibleDaoIds.length === 0) {
    return [];
  }

  const statuses =
    await prisma.commanderStatus.findMany({
      where: {
        userId: {
          in: possibleDaoIds,
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

  return possibleDaoIds.filter(
    (userId) =>
      latestState.get(userId) === true
  );
}

export async function getProtocolGovernanceDashboard() {
  const [statusGroups, proposals] =
    await Promise.all([
      prisma.protocolServiceProposal.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.protocolServiceProposal.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 100,

        select: {
          id: true,
          serviceType: true,
          name: true,
          description: true,
          chainId: true,
          contractAddress: true,
          endpoint: true,
          status: true,
          requiredApprovals: true,
          createdAt: true,
          decidedAt: true,
          activatedAt: true,
          retiredAt: true,

          proposer: {
            select: {
              id: true,
              username: true,
            },
          },

          votes: {
            select: {
              vote: true,
              createdAt: true,

              voter: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      }),
    ]);

  const counts = {
    submitted: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    technicallyApproved: 0,
    technicallyRejected: 0,
    active: 0,
    retired: 0,
    cancelled: 0,
  };

  for (const group of statusGroups) {
    const value = group._count._all;

    if (group.status === "SUBMITTED") {
      counts.submitted = value;
    }

    if (group.status === "UNDER_REVIEW") {
      counts.underReview = value;
    }

    if (group.status === "APPROVED") {
      counts.approved = value;
    }

    if (group.status === "REJECTED") {
      counts.rejected = value;
    }

    if (
      group.status ===
      "TECHNICALLY_APPROVED"
    ) {
      counts.technicallyApproved =
        value;
    }

    if (
      group.status ===
      "TECHNICALLY_REJECTED"
    ) {
      counts.technicallyRejected =
        value;
    }

    if (group.status === "ACTIVE") {
      counts.active = value;
    }

    if (group.status === "RETIRED") {
      counts.retired = value;
    }

    if (group.status === "CANCELLED") {
      counts.cancelled = value;
    }
  }

  const queue = proposals.map(
    (proposal) => {
      const approvals =
        proposal.votes.filter(
          (vote) =>
            vote.vote === "APPROVE"
        ).length;

      const rejections =
        proposal.votes.filter(
          (vote) =>
            vote.vote === "REJECT"
        ).length;

      return {
        ...proposal,
        approvals,
        rejections,
        approvalsRemaining: Math.max(
          proposal.requiredApprovals -
            approvals,
          0
        ),
      };
    }
  );

  return {
    ...counts,
    queue,
  };
}

export async function createProtocolServiceProposal(
  input: {
    serviceType: ProtocolServiceType;
    name: string;
    description: string;
    chainId?: number;
    contractAddress?: string;
    endpoint?: string;
    actor: GovernanceActor;
  }
) {
  await assertDaoCouncilMember(
    input.actor.id
  );

  const daoCouncilIds =
    await getActiveDaoCouncilMemberIds();

  const requiredApprovals =
    Math.floor(
      daoCouncilIds.length / 2
    ) + 1;

  return prisma.$transaction(
    async (transaction) => {
      const proposal =
        await transaction.protocolServiceProposal.create({
          data: {
            proposerId:
              input.actor.id,
            serviceType:
              input.serviceType,
            name: input.name,
            description:
              input.description,
            chainId:
              input.chainId ?? null,
            contractAddress:
              input.contractAddress ??
              null,
            endpoint:
              input.endpoint ?? null,
            requiredApprovals,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "PROTOCOL_SERVICE_PROPOSAL_CREATED",
          entityType:
            "PROTOCOL_SERVICE",
          entityId:
            proposal.id,
          reason:
            input.description,
          outcome: "SUBMITTED",
          metadata: {
            serviceType:
              input.serviceType,
            serviceName:
              input.name,
            daoCouncilSize:
              daoCouncilIds.length,
            requiredApprovals,
          },
        },
        transaction
      );

      return proposal;
    }
  );
}

export async function castProtocolServiceVote(
  input: {
    proposalId: string;
    vote: GovernanceVote;
    reason?: string;
    actor: GovernanceActor;
  }
) {
  await assertDaoCouncilMember(
    input.actor.id
  );

  return prisma.$transaction(
    async (transaction) => {
      const proposal =
        await transaction.protocolServiceProposal.findUnique({
          where: {
            id: input.proposalId,
          },
        });

      if (!proposal) {
        throw createHttpError(
          "PROTOCOL_PROPOSAL_NOT_FOUND",
          404
        );
      }

      if (
        proposal.status !== "SUBMITTED" &&
        proposal.status !==
          "UNDER_REVIEW"
      ) {
        throw createHttpError(
          "PROTOCOL_PROPOSAL_NOT_OPEN_FOR_VOTING",
          409
        );
      }

      const existingVote =
        await transaction.protocolServiceVote.findUnique({
          where: {
            proposalId_voterId: {
              proposalId:
                proposal.id,
              voterId:
                input.actor.id,
            },
          },
          select: {
            id: true,
          },
        });

      if (existingVote) {
        throw createHttpError(
          "PROTOCOL_VOTE_ALREADY_CAST",
          409
        );
      }

      const vote =
        await transaction.protocolServiceVote.create({
          data: {
            proposalId:
              proposal.id,
            voterId:
              input.actor.id,
            vote: input.vote,
            reason:
              input.reason ?? null,
          },
        });

      const [approvals, rejections] =
        await Promise.all([
          transaction.protocolServiceVote.count({
            where: {
              proposalId:
                proposal.id,
              vote: "APPROVE",
            },
          }),

          transaction.protocolServiceVote.count({
            where: {
              proposalId:
                proposal.id,
              vote: "REJECT",
            },
          }),
        ]);

      let nextStatus:
        | "UNDER_REVIEW"
        | "APPROVED"
        | "REJECTED" =
        "UNDER_REVIEW";

      if (
        approvals >=
        proposal.requiredApprovals
      ) {
        nextStatus = "APPROVED";
      }

      if (
        rejections >=
        proposal.requiredApprovals
      ) {
        nextStatus = "REJECTED";
      }

      await transaction.protocolServiceProposal.update({
        where: {
          id: proposal.id,
        },
        data: {
          status: nextStatus,
          decidedAt:
            nextStatus ===
            "UNDER_REVIEW"
              ? null
              : new Date(),
        },
      });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "PROTOCOL_SERVICE_VOTE_CAST",
          entityType:
            "PROTOCOL_SERVICE",
          entityId:
            proposal.id,
          reason:
            input.reason ??
            "DAO Council vote",
          outcome: input.vote,
          metadata: {
            approvals,
            rejections,
            requiredApprovals:
              proposal.requiredApprovals,
            resultingStatus:
              nextStatus,
          },
        },
        transaction
      );

      return {
        vote,
        proposalStatus:
          nextStatus,
        approvals,
        rejections,
        requiredApprovals:
          proposal.requiredApprovals,
      };
    }
  );
}

export async function assessProtocolServiceProposal(
  input: {
    proposalId: string;
    decision: TechnicalDecision;
    assessment: string;
    actor: GovernanceActor;
  }
) {
  await assertDevelopmentMember(
    input.actor.id
  );

  return prisma.$transaction(
    async (transaction) => {
      const proposal =
        await transaction.protocolServiceProposal.findUnique({
          where: {
            id: input.proposalId,
          },
        });

      if (!proposal) {
        throw createHttpError(
          "PROTOCOL_PROPOSAL_NOT_FOUND",
          404
        );
      }

      if (proposal.status !== "APPROVED") {
        throw createHttpError(
          "DAO_APPROVAL_REQUIRED",
          409
        );
      }

      const nextStatus =
        input.decision === "APPROVE"
          ? "TECHNICALLY_APPROVED"
          : "TECHNICALLY_REJECTED";

      const updatedProposal =
        await transaction.protocolServiceProposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status: nextStatus,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "PROTOCOL_TECHNICAL_ASSESSMENT_RECORDED",
          entityType:
            "PROTOCOL_SERVICE",
          entityId:
            proposal.id,
          reason:
            input.assessment,
          outcome:
            nextStatus,
          metadata: {
            technicalDecision:
              input.decision,
          },
        },
        transaction
      );

      return updatedProposal;
    }
  );
}

export async function activateProtocolServiceProposal(
  input: {
    proposalId: string;
    transactionHash: string;
    implementationNotes: string;
    actor: GovernanceActor;
  }
) {
  await assertDevelopmentMember(
    input.actor.id
  );

  return prisma.$transaction(
    async (transaction) => {
      const proposal =
        await transaction.protocolServiceProposal.findUnique({
          where: {
            id: input.proposalId,
          },
        });

      if (!proposal) {
        throw createHttpError(
          "PROTOCOL_PROPOSAL_NOT_FOUND",
          404
        );
      }

      if (
        proposal.status !==
        "TECHNICALLY_APPROVED"
      ) {
        throw createHttpError(
          "TECHNICAL_APPROVAL_REQUIRED",
          409
        );
      }

      const activatedProposal =
        await transaction.protocolServiceProposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status: "ACTIVE",
            activatedAt: new Date(),
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "PROTOCOL_SERVICE_ACTIVATED",
          entityType:
            "PROTOCOL_SERVICE",
          entityId:
            proposal.id,
          reason:
            input.implementationNotes,
          outcome: "ACTIVE",
          metadata: {
            transactionHash:
              input.transactionHash,
            serviceType:
              proposal.serviceType,
            serviceName:
              proposal.name,
          },
        },
        transaction
      );

      return activatedProposal;
    }
  );
}