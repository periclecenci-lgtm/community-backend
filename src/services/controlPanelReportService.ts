import type { User } from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ReportActor = Pick<
  User,
  "id" | "username"
>;

type ReportTargetType =
  | "USER"
  | "POST"
  | "COMMENT"
  | "PROJECT";

type ReportResolution =
  | "RESOLVE"
  | "ESCALATE"
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

export async function getReportsDashboard() {
  const [statusGroups, reports] =
    await Promise.all([
      prisma.communityReport.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.communityReport.findMany({
        where: {
          status: {
            in: [
              "OPEN",
              "UNDER_REVIEW",
              "ESCALATED",
            ],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 100,
        select: {
          id: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
          reviewedAt: true,

          reporter: {
            select: {
              id: true,
              username: true,
            },
          },

          reviewedBy: {
            select: {
              id: true,
              username: true,
            },
          },

          targetUser: {
            select: {
              id: true,
              username: true,
              status: true,
            },
          },

          targetPost: {
            select: {
              id: true,
              title: true,
              visibility: true,
            },
          },

          targetComment: {
            select: {
              id: true,
              content: true,
              visibility: true,
            },
          },

          targetProject: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      }),
    ]);

  const counts = {
    open: 0,
    underReview: 0,
    resolved: 0,
    escalated: 0,
    rejected: 0,
  };

  for (const group of statusGroups) {
    if (group.status === "OPEN") {
      counts.open = group._count._all;
    }

    if (group.status === "UNDER_REVIEW") {
      counts.underReview =
        group._count._all;
    }

    if (group.status === "RESOLVED") {
      counts.resolved =
        group._count._all;
    }

    if (group.status === "ESCALATED") {
      counts.escalated =
        group._count._all;
    }

    if (group.status === "REJECTED") {
      counts.rejected =
        group._count._all;
    }
  }

  const queue = reports.map((report) => {
    if (report.targetUser) {
      return {
        ...report,
        targetType: "USER" as const,
        target: report.targetUser,
        targetUser: undefined,
        targetPost: undefined,
        targetComment: undefined,
        targetProject: undefined,
      };
    }

    if (report.targetPost) {
      return {
        ...report,
        targetType: "POST" as const,
        target: report.targetPost,
        targetUser: undefined,
        targetPost: undefined,
        targetComment: undefined,
        targetProject: undefined,
      };
    }

    if (report.targetComment) {
      return {
        ...report,
        targetType: "COMMENT" as const,
        target: report.targetComment,
        targetUser: undefined,
        targetPost: undefined,
        targetComment: undefined,
        targetProject: undefined,
      };
    }

    return {
      ...report,
      targetType: "PROJECT" as const,
      target: report.targetProject,
      targetUser: undefined,
      targetPost: undefined,
      targetComment: undefined,
      targetProject: undefined,
    };
  });

  return {
    ...counts,
    queue,
  };
}

export async function createCommunityReport(
  input: {
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    details?: string;
    actor: ReportActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      if (input.targetType === "USER") {
        if (input.targetId === input.actor.id) {
          throw createHttpError(
            "CANNOT_REPORT_SELF",
            400
          );
        }

        const target =
          await transaction.user.findUnique({
            where: {
              id: input.targetId,
            },
            select: {
              id: true,
            },
          });

        if (!target) {
          throw createHttpError(
            "REPORT_TARGET_NOT_FOUND",
            404
          );
        }
      }

      if (input.targetType === "POST") {
        const target =
          await transaction.post.findUnique({
            where: {
              id: input.targetId,
            },
            select: {
              id: true,
            },
          });

        if (!target) {
          throw createHttpError(
            "REPORT_TARGET_NOT_FOUND",
            404
          );
        }
      }

      if (input.targetType === "COMMENT") {
        const target =
          await transaction.comment.findUnique({
            where: {
              id: input.targetId,
            },
            select: {
              id: true,
            },
          });

        if (!target) {
          throw createHttpError(
            "REPORT_TARGET_NOT_FOUND",
            404
          );
        }
      }

      if (input.targetType === "PROJECT") {
        const target =
          await transaction.communityProject.findUnique({
            where: {
              id: input.targetId,
            },
            select: {
              id: true,
            },
          });

        if (!target) {
          throw createHttpError(
            "REPORT_TARGET_NOT_FOUND",
            404
          );
        }
      }

      const existingReport =
        await transaction.communityReport.findFirst({
          where: {
            reporterId: input.actor.id,
            status: {
              in: [
                "OPEN",
                "UNDER_REVIEW",
                "ESCALATED",
              ],
            },
            targetUserId:
              input.targetType === "USER"
                ? input.targetId
                : null,
            targetPostId:
              input.targetType === "POST"
                ? input.targetId
                : null,
            targetCommentId:
              input.targetType === "COMMENT"
                ? input.targetId
                : null,
            targetProjectId:
              input.targetType === "PROJECT"
                ? input.targetId
                : null,
          },
          select: {
            id: true,
          },
        });

      if (existingReport) {
        throw createHttpError(
          "REPORT_ALREADY_EXISTS",
          409
        );
      }

      const report =
        await transaction.communityReport.create({
          data: {
            reporterId: input.actor.id,
            reason: input.reason,
            details:
              input.details ?? null,

            targetUserId:
              input.targetType === "USER"
                ? input.targetId
                : null,

            targetPostId:
              input.targetType === "POST"
                ? input.targetId
                : null,

            targetCommentId:
              input.targetType === "COMMENT"
                ? input.targetId
                : null,

            targetProjectId:
              input.targetType === "PROJECT"
                ? input.targetId
                : null,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "COMMUNITY_REPORT_CREATED",
          entityType: "REPORT",
          entityId: report.id,
          reason: input.reason,
          outcome: "OPEN",
          metadata: {
            targetType:
              input.targetType,
            targetId:
              input.targetId,
          },
        },
        transaction
      );

      return report;
    }
  );
}

export async function takeReportForReview(
  input: {
    reportId: string;
    actor: ReportActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const result =
        await transaction.communityReport.updateMany({
          where: {
            id: input.reportId,
            status: "OPEN",
          },
          data: {
            status: "UNDER_REVIEW",
            reviewedById:
              input.actor.id,
            reviewedAt: new Date(),
          },
        });

      if (result.count === 0) {
        const report =
          await transaction.communityReport.findUnique({
            where: {
              id: input.reportId,
            },
            select: {
              id: true,
            },
          });

        throw createHttpError(
          report
            ? "REPORT_NOT_AVAILABLE"
            : "REPORT_NOT_FOUND",
          report ? 409 : 404
        );
      }

      const report =
        await transaction.communityReport.findUniqueOrThrow({
          where: {
            id: input.reportId,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "COMMUNITY_REPORT_TAKEN_FOR_REVIEW",
          entityType: "REPORT",
          entityId: report.id,
          reason:
            "Report taken for review",
          outcome: "UNDER_REVIEW",
        },
        transaction
      );

      return report;
    }
  );
}

export async function resolveCommunityReport(
  input: {
    reportId: string;
    resolution: ReportResolution;
    reason: string;
    actor: ReportActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const report =
        await transaction.communityReport.findUnique({
          where: {
            id: input.reportId,
          },
        });

      if (!report) {
        throw createHttpError(
          "REPORT_NOT_FOUND",
          404
        );
      }

      if (
        report.status === "RESOLVED" ||
        report.status === "REJECTED"
      ) {
        throw createHttpError(
          "REPORT_ALREADY_RESOLVED",
          409
        );
      }

      const nextStatus =
        input.resolution === "ESCALATE"
          ? "ESCALATED"
          : input.resolution === "REJECT"
            ? "REJECTED"
            : "RESOLVED";

      const updatedReport =
        await transaction.communityReport.update({
          where: {
            id: report.id,
          },
          data: {
            status: nextStatus,
            reviewedById:
              input.actor.id,
            reviewedAt:
              report.reviewedAt ??
              new Date(),
            reviewOutcome:
              input.reason,
            resolvedAt:
              nextStatus === "ESCALATED"
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
            "COMMUNITY_REPORT_RESOLVED",
          entityType: "REPORT",
          entityId: report.id,
          reason: input.reason,
          outcome: nextStatus,
          metadata: {
            previousStatus:
              report.status,
            resolution:
              input.resolution,
          },
        },
        transaction
      );

      return updatedReport;
    }
  );
}