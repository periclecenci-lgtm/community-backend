import type { User } from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ModerationActor = Pick<
  User,
  "id" | "username"
>;

type ResolveDecision =
  | "CONFIRM"
  | "RESTORE";

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

export async function getModerationDashboard() {
  const [
    pendingPosts,
    pendingComments,
    pendingReports,
    cases,
  ] = await Promise.all([
    prisma.contentModerationCase.count({
      where: {
        status: "OPEN",
        postId: {
          not: null,
        },
      },
    }),

    prisma.contentModerationCase.count({
      where: {
        status: "OPEN",
        commentId: {
          not: null,
        },
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

    prisma.contentModerationCase.findMany({
      where: {
        status: "OPEN",
      },
      orderBy: {
        openedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        reason: true,
        status: true,
        openedAt: true,

        openedBy: {
          select: {
            id: true,
            username: true,
          },
        },

        post: {
          select: {
            id: true,
            title: true,
            visibility: true,
            author: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },

        comment: {
          select: {
            id: true,
            content: true,
            visibility: true,
            author: {
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

  const queue = cases.map((moderationCase) => {
    if (moderationCase.post) {
      return {
        id: moderationCase.id,
        targetType: "POST" as const,
        target: moderationCase.post,
        reason: moderationCase.reason,
        status: moderationCase.status,
        openedAt: moderationCase.openedAt,
        openedBy: moderationCase.openedBy,
      };
    }

    return {
      id: moderationCase.id,
      targetType: "COMMENT" as const,
      target: moderationCase.comment,
      reason: moderationCase.reason,
      status: moderationCase.status,
      openedAt: moderationCase.openedAt,
      openedBy: moderationCase.openedBy,
    };
  });

  return {
    pendingPosts,
    pendingComments,
    pendingReports,
    queue,
  };
}

export async function temporarilyHidePost(
  input: {
    postId: string;
    reason: string;
    actor: ModerationActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const post =
        await transaction.post.findUnique({
          where: {
            id: input.postId,
          },
          select: {
            id: true,
            title: true,
            visibility: true,
          },
        });

      if (!post) {
        throw createHttpError(
          "POST_NOT_FOUND",
          404
        );
      }

      if (post.visibility !== "VISIBLE") {
        throw createHttpError(
          "POST_ALREADY_HIDDEN",
          409
        );
      }

      const existingCase =
        await transaction.contentModerationCase.findFirst({
          where: {
            postId: post.id,
            status: "OPEN",
          },
          select: {
            id: true,
          },
        });

      if (existingCase) {
        throw createHttpError(
          "POST_ALREADY_UNDER_REVIEW",
          409
        );
      }

      const moderationCase =
        await transaction.contentModerationCase.create({
          data: {
            postId: post.id,
            reason: input.reason,
            openedById: input.actor.id,

            actions: {
              create: {
                actorId: input.actor.id,
                action:
                  "TEMPORARILY_HIDE",
                reason: input.reason,
              },
            },
          },
          include: {
            actions: true,
          },
        });

      await transaction.post.update({
        where: {
          id: post.id,
        },
        data: {
          visibility:
            "TEMPORARILY_HIDDEN",
          visibilityReason:
            input.reason,
          hiddenAt: new Date(),
        },
      });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "POST_TEMPORARILY_HIDDEN",
          entityType: "POST",
          entityId: post.id,
          reason: input.reason,
          outcome: "OPENED_FOR_REVIEW",
          metadata: {
            moderationCaseId:
              moderationCase.id,
            postTitle: post.title,
          },
        },
        transaction
      );

      return moderationCase;
    }
  );
}

export async function temporarilyHideComment(
  input: {
    commentId: string;
    reason: string;
    actor: ModerationActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const comment =
        await transaction.comment.findUnique({
          where: {
            id: input.commentId,
          },
          select: {
            id: true,
            content: true,
            visibility: true,
          },
        });

      if (!comment) {
        throw createHttpError(
          "COMMENT_NOT_FOUND",
          404
        );
      }

      if (
        comment.visibility !== "VISIBLE"
      ) {
        throw createHttpError(
          "COMMENT_ALREADY_HIDDEN",
          409
        );
      }

      const existingCase =
        await transaction.contentModerationCase.findFirst({
          where: {
            commentId: comment.id,
            status: "OPEN",
          },
          select: {
            id: true,
          },
        });

      if (existingCase) {
        throw createHttpError(
          "COMMENT_ALREADY_UNDER_REVIEW",
          409
        );
      }

      const moderationCase =
        await transaction.contentModerationCase.create({
          data: {
            commentId: comment.id,
            reason: input.reason,
            openedById: input.actor.id,

            actions: {
              create: {
                actorId: input.actor.id,
                action:
                  "TEMPORARILY_HIDE",
                reason: input.reason,
              },
            },
          },
          include: {
            actions: true,
          },
        });

      await transaction.comment.update({
        where: {
          id: comment.id,
        },
        data: {
          visibility:
            "TEMPORARILY_HIDDEN",
          visibilityReason:
            input.reason,
          hiddenAt: new Date(),
        },
      });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "COMMENT_TEMPORARILY_HIDDEN",
          entityType: "COMMENT",
          entityId: comment.id,
          reason: input.reason,
          outcome: "OPENED_FOR_REVIEW",
          metadata: {
            moderationCaseId:
              moderationCase.id,
          },
        },
        transaction
      );

      return moderationCase;
    }
  );
}

export async function resolveModerationCase(
  input: {
    caseId: string;
    decision: ResolveDecision;
    reason: string;
    actor: ModerationActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const moderationCase =
        await transaction.contentModerationCase.findUnique({
          where: {
            id: input.caseId,
          },
          select: {
            id: true,
            status: true,
            postId: true,
            commentId: true,
          },
        });

      if (!moderationCase) {
        throw createHttpError(
          "MODERATION_CASE_NOT_FOUND",
          404
        );
      }

      if (moderationCase.status !== "OPEN") {
        throw createHttpError(
          "MODERATION_CASE_ALREADY_RESOLVED",
          409
        );
      }

      const confirm =
        input.decision === "CONFIRM";

      const resolvedCase =
        await transaction.contentModerationCase.update({
          where: {
            id: moderationCase.id,
          },
          data: {
            status: confirm
              ? "CONFIRMED"
              : "REVOKED",
            resolvedById: input.actor.id,
            resolvedAt: new Date(),

            actions: {
              create: {
                actorId: input.actor.id,
                action: confirm
                  ? "CONFIRM_HIDE"
                  : "RESTORE",
                reason: input.reason,
              },
            },
          },
          include: {
            actions: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        });

      if (moderationCase.postId) {
        await transaction.post.update({
          where: {
            id: moderationCase.postId,
          },
          data: confirm
            ? {
                visibility: "HIDDEN",
                visibilityReason:
                  input.reason,
              }
            : {
                visibility: "VISIBLE",
                visibilityReason: null,
                hiddenAt: null,
              },
        });
      }

      if (moderationCase.commentId) {
        await transaction.comment.update({
          where: {
            id: moderationCase.commentId,
          },
          data: confirm
            ? {
                visibility: "HIDDEN",
                visibilityReason:
                  input.reason,
              }
            : {
                visibility: "VISIBLE",
                visibilityReason: null,
                hiddenAt: null,
              },
        });
      }

      const entityType =
        moderationCase.postId
          ? "POST"
          : "COMMENT";

      const entityId =
        moderationCase.postId ??
        moderationCase.commentId;

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action: confirm
            ? "CONTENT_HIDE_CONFIRMED"
            : "CONTENT_RESTORED",
          entityType,
          entityId,
          reason: input.reason,
          outcome: confirm
            ? "HIDDEN"
            : "VISIBLE",
          metadata: {
            moderationCaseId:
              moderationCase.id,
          },
        },
        transaction
      );

      return resolvedCase;
    }
  );
}