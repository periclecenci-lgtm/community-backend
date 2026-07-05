import type { User } from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ManagementActor = Pick<
  User,
  "id" | "username"
>;

type DisciplinaryType =
  | "SUSPENSION"
  | "REINSTATEMENT";

type DisciplinaryVoteValue =
  | "APPROVE"
  | "REJECT";

const REQUIRED_APPROVALS = 3;

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

async function assertEligibleManagementMember(
  userId: string,
  database: typeof prisma
) {
  const [membership, commanderStatus] =
    await Promise.all([
      database.communityTeamMembership.findFirst({
        where: {
          userId,
          team: "USER_MANAGEMENT",
          endedAt: null,
        },
        select: {
          id: true,
        },
      }),

      database.commanderStatus.findFirst({
        where: {
          userId,
        },
        orderBy: {
          lastCheckedAt: "desc",
        },
        select: {
          isCommander: true,
        },
      }),
    ]);

  if (
    !membership ||
    !commanderStatus?.isCommander
  ) {
    throw createHttpError(
      "USER_MANAGEMENT_MEMBERSHIP_REQUIRED",
      403
    );
  }
}

export async function getUserManagementDashboard() {
  const [
    pendingReviews,
    suspendedUsers,
    activeCases,
    cases,
  ] = await Promise.all([
    prisma.communityReport.count({
      where: {
        targetUserId: {
          not: null,
        },
        status: {
          in: [
            "OPEN",
            "UNDER_REVIEW",
            "ESCALATED",
          ],
        },
      },
    }),

    prisma.user.count({
      where: {
        status: "SUSPENDED",
      },
    }),

    prisma.userDisciplinaryCase.count({
      where: {
        status: "OPEN",
      },
    }),

    prisma.userDisciplinaryCase.findMany({
      where: {
        status: "OPEN",
      },
      orderBy: {
        openedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        reason: true,
        requiredApprovals: true,
        openedAt: true,

        subjectUser: {
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
          },
        },

        openedBy: {
          select: {
            id: true,
            username: true,
          },
        },

        sourceReport: {
          select: {
            id: true,
            reason: true,
            status: true,
          },
        },

        votes: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            vote: true,
            reason: true,
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

  const queue = cases.map(
    (disciplinaryCase) => {
      const approvals =
        disciplinaryCase.votes.filter(
          (vote) =>
            vote.vote === "APPROVE"
        ).length;

      const rejections =
        disciplinaryCase.votes.filter(
          (vote) =>
            vote.vote === "REJECT"
        ).length;

      return {
        ...disciplinaryCase,
        approvals,
        rejections,
        approvalsRemaining: Math.max(
          disciplinaryCase.requiredApprovals -
            approvals,
          0
        ),
      };
    }
  );

  return {
    pendingReviews,
    suspendedUsers,
    activeCases,
    requiredVotesToDecide:
      REQUIRED_APPROVALS,
    queue,
  };
}

export async function openDisciplinaryCase(
  input: {
    subjectUserId: string;
    type: DisciplinaryType;
    reason: string;
    sourceReportId?: string;
    actor: ManagementActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertEligibleManagementMember(
        input.actor.id,
        transaction as typeof prisma
      );

      if (
        input.subjectUserId ===
        input.actor.id
      ) {
        throw createHttpError(
          "CANNOT_OPEN_CASE_AGAINST_SELF",
          400
        );
      }

      const subjectUser =
        await transaction.user.findUnique({
          where: {
            id: input.subjectUserId,
          },
          select: {
            id: true,
            username: true,
            status: true,
          },
        });

      if (!subjectUser) {
        throw createHttpError(
          "USER_NOT_FOUND",
          404
        );
      }

      if (
        input.type === "SUSPENSION" &&
        subjectUser.status !== "ACTIVE"
      ) {
        throw createHttpError(
          "USER_NOT_ACTIVE",
          409
        );
      }

      if (
        input.type === "REINSTATEMENT" &&
        subjectUser.status !== "SUSPENDED"
      ) {
        throw createHttpError(
          "USER_NOT_SUSPENDED",
          409
        );
      }

      const existingCase =
        await transaction.userDisciplinaryCase.findFirst({
          where: {
            subjectUserId:
              subjectUser.id,
            status: "OPEN",
          },
          select: {
            id: true,
          },
        });

      if (existingCase) {
        throw createHttpError(
          "USER_ALREADY_HAS_OPEN_CASE",
          409
        );
      }

      if (input.sourceReportId) {
        const report =
          await transaction.communityReport.findUnique({
            where: {
              id: input.sourceReportId,
            },
            select: {
              id: true,
              targetUserId: true,
            },
          });

        if (!report) {
          throw createHttpError(
            "SOURCE_REPORT_NOT_FOUND",
            404
          );
        }

        if (
          report.targetUserId !==
          subjectUser.id
        ) {
          throw createHttpError(
            "SOURCE_REPORT_TARGET_MISMATCH",
            400
          );
        }
      }

      const disciplinaryCase =
        await transaction.userDisciplinaryCase.create({
          data: {
            subjectUserId:
              subjectUser.id,
            openedById:
              input.actor.id,
            sourceReportId:
              input.sourceReportId ??
              null,
            type: input.type,
            reason: input.reason,
            requiredApprovals:
              REQUIRED_APPROVALS,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "DISCIPLINARY_CASE_OPENED",
          entityType:
            "DISCIPLINARY_CASE",
          entityId:
            disciplinaryCase.id,
          reason: input.reason,
          outcome: "OPEN",
          metadata: {
            subjectUserId:
              subjectUser.id,
            subjectUsername:
              subjectUser.username,
            caseType:
              input.type,
          },
        },
        transaction
      );

      return disciplinaryCase;
    }
  );
}

export async function castDisciplinaryVote(
  input: {
    caseId: string;
    vote: DisciplinaryVoteValue;
    reason?: string;
    actor: ManagementActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertEligibleManagementMember(
        input.actor.id,
        transaction as typeof prisma
      );

      const disciplinaryCase =
        await transaction.userDisciplinaryCase.findUnique({
          where: {
            id: input.caseId,
          },
          select: {
            id: true,
            subjectUserId: true,
            type: true,
            status: true,
            requiredApprovals: true,
          },
        });

      if (!disciplinaryCase) {
        throw createHttpError(
          "DISCIPLINARY_CASE_NOT_FOUND",
          404
        );
      }

      if (
        disciplinaryCase.status !== "OPEN"
      ) {
        throw createHttpError(
          "DISCIPLINARY_CASE_ALREADY_RESOLVED",
          409
        );
      }

      if (
        disciplinaryCase.subjectUserId ===
        input.actor.id
      ) {
        throw createHttpError(
          "CANNOT_VOTE_ON_OWN_CASE",
          400
        );
      }

      const existingVote =
        await transaction.userDisciplinaryVote.findUnique({
          where: {
            caseId_voterId: {
              caseId:
                disciplinaryCase.id,
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
          "VOTE_ALREADY_CAST",
          409
        );
      }

      const vote =
        await transaction.userDisciplinaryVote.create({
          data: {
            caseId:
              disciplinaryCase.id,
            voterId:
              input.actor.id,
            vote: input.vote,
            reason:
              input.reason ?? null,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "DISCIPLINARY_VOTE_CAST",
          entityType:
            "DISCIPLINARY_CASE",
          entityId:
            disciplinaryCase.id,
          reason:
            input.reason ??
            "Disciplinary vote",
          outcome: input.vote,
        },
        transaction
      );

      const [approvals, rejections] =
        await Promise.all([
          transaction.userDisciplinaryVote.count({
            where: {
              caseId:
                disciplinaryCase.id,
              vote: "APPROVE",
            },
          }),

          transaction.userDisciplinaryVote.count({
            where: {
              caseId:
                disciplinaryCase.id,
              vote: "REJECT",
            },
          }),
        ]);

      let finalStatus:
        | "OPEN"
        | "APPROVED"
        | "REJECTED" = "OPEN";

      if (
        approvals >=
        disciplinaryCase.requiredApprovals
      ) {
        finalStatus = "APPROVED";
      }

      if (
        rejections >=
        disciplinaryCase.requiredApprovals
      ) {
        finalStatus = "REJECTED";
      }

      if (finalStatus !== "OPEN") {
        await transaction.userDisciplinaryCase.update({
          where: {
            id: disciplinaryCase.id,
          },
          data: {
            status: finalStatus,
            resolvedById:
              input.actor.id,
            resolvedAt: new Date(),
          },
        });

        if (finalStatus === "APPROVED") {
          const nextUserStatus =
            disciplinaryCase.type ===
            "SUSPENSION"
              ? "SUSPENDED"
              : "ACTIVE";

          await transaction.user.update({
            where: {
              id:
                disciplinaryCase.subjectUserId,
            },
            data: {
              status: nextUserStatus,
            },
          });

          if (
            disciplinaryCase.type ===
            "SUSPENSION"
          ) {
            await transaction.session.updateMany({
              where: {
                userId:
                  disciplinaryCase.subjectUserId,
                revokedAt: null,
              },
              data: {
                revokedAt: new Date(),
              },
            });
          }
        }

        await createAuditEvent(
          {
            actorId: input.actor.id,
            actorType: "USER",
            actorLabel:
              input.actor.username,
            action:
              "DISCIPLINARY_CASE_RESOLVED",
            entityType:
              "DISCIPLINARY_CASE",
            entityId:
              disciplinaryCase.id,
            reason:
              "Voting threshold reached",
            outcome: finalStatus,
            metadata: {
              approvals,
              rejections,
              subjectUserId:
                disciplinaryCase.subjectUserId,
              caseType:
                disciplinaryCase.type,
            },
          },
          transaction
        );
      }

      return {
        vote,
        caseStatus: finalStatus,
        approvals,
        rejections,
        requiredApprovals:
          disciplinaryCase.requiredApprovals,
      };
    }
  );
}