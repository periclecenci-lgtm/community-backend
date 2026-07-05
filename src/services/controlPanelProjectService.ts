import type {
  ProjectRecommendation,
  ProjectStatus,
  User,
} from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ProjectActor = Pick<User, "id" | "username">;

type EvaluationTeam =
  | "USER_MANAGEMENT"
  | "DEVELOPMENT";

type ScoreInput = {
  utilityScore?: number;
  qualityScore?: number;
  impactScore?: number;
  feasibilityScore?: number;
  sustainabilityScore?: number;
  integrationScore?: number;
};

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

async function assertCommander(
  userId: string,
  database: typeof prisma
) {
  const commanderStatus =
    await database.commanderStatus.findFirst({
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

  if (!commanderStatus?.isCommander) {
    throw createHttpError(
      "COMMANDER_STATUS_REQUIRED",
      403
    );
  }
}

async function assertTeamMember(
  input: {
    userId: string;
    team: EvaluationTeam;
  },
  database: typeof prisma
) {
  const currentDate = new Date();

  const membership =
    await database.communityTeamMembership.findFirst({
      where: {
        userId: input.userId,
        team: input.team,
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
        id: true,
      },
    });

  if (!membership) {
    throw createHttpError(
      "PROJECT_TEAM_MEMBERSHIP_REQUIRED",
      403
    );
  }

  if (input.team === "USER_MANAGEMENT") {
    await assertCommander(
      input.userId,
      database
    );
  }
}

export async function getProjectsDashboard() {
  const [statusGroups, projects] =
    await Promise.all([
      prisma.communityProject.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.communityProject.findMany({
        orderBy: {
          submittedAt: "asc",
        },
        take: 100,

        select: {
          id: true,
          title: true,
          summary: true,
          status: true,
          submittedAt: true,
          updatedAt: true,

          author: {
            select: {
              id: true,
              username: true,
            },
          },

          sourcePost: {
            select: {
              id: true,
              title: true,
              visibility: true,
            },
          },

          _count: {
            select: {
              likes: true,
              commanderReviews: true,
              teamEvaluations: true,
            },
          },

          commanderReviews: {
            select: {
              recommendation: true,
            },
          },

          teamEvaluations: {
            select: {
              team: true,
              recommendation: true,
            },
          },
        },
      }),
    ]);

  const counts = {
    submitted: 0,
    commanderReview: 0,
    selected: 0,
    inDevelopment: 0,
    completed: 0,
    rejected: 0,
  };

  for (const group of statusGroups) {
    if (group.status === "SUBMITTED") {
      counts.submitted = group._count._all;
    }

    if (group.status === "COMMANDER_REVIEW") {
      counts.commanderReview =
        group._count._all;
    }

    if (group.status === "SELECTED") {
      counts.selected = group._count._all;
    }

    if (group.status === "IN_DEVELOPMENT") {
      counts.inDevelopment =
        group._count._all;
    }

    if (group.status === "COMPLETED") {
      counts.completed = group._count._all;
    }

    if (group.status === "REJECTED") {
      counts.rejected = group._count._all;
    }
  }

  const queue = projects.map((project) => {
    const commanderSupport =
      project.commanderReviews.filter(
        (review) =>
          review.recommendation === "SUPPORT"
      ).length;

    const commanderOpposition =
      project.commanderReviews.filter(
        (review) =>
          review.recommendation === "OPPOSE"
      ).length;

    const userManagementSupport =
      project.teamEvaluations.filter(
        (evaluation) =>
          evaluation.team ===
            "USER_MANAGEMENT" &&
          evaluation.recommendation ===
            "SUPPORT"
      ).length;

    const developmentSupport =
      project.teamEvaluations.filter(
        (evaluation) =>
          evaluation.team === "DEVELOPMENT" &&
          evaluation.recommendation ===
            "SUPPORT"
      ).length;

    return {
      id: project.id,
      title: project.title,
      summary: project.summary,
      status: project.status,
      submittedAt: project.submittedAt,
      updatedAt: project.updatedAt,
      author: project.author,
      sourcePost: project.sourcePost,
      likes: project._count.likes,
      commanderReviews:
        project._count.commanderReviews,
      commanderSupport,
      commanderOpposition,
      teamEvaluations:
        project._count.teamEvaluations,
      userManagementSupport,
      developmentSupport,
    };
  });

  return {
    ...counts,
    queue,
  };
}

export async function reviewProjectAsCommander(
  input: {
    projectId: string;
    recommendation: ProjectRecommendation;
    comment: string;
    actor: ProjectActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertCommander(
        input.actor.id,
        transaction as typeof prisma
      );

      const project =
        await transaction.communityProject.findUnique({
          where: {
            id: input.projectId,
          },
          select: {
            id: true,
            title: true,
            status: true,
          },
        });

      if (!project) {
        throw createHttpError(
          "PROJECT_NOT_FOUND",
          404
        );
      }

      if (
        project.status !== "SUBMITTED" &&
        project.status !== "COMMANDER_REVIEW"
      ) {
        throw createHttpError(
          "PROJECT_NOT_OPEN_FOR_COMMANDER_REVIEW",
          409
        );
      }

      const review =
        await transaction.commanderProjectReview.upsert({
          where: {
            projectId_reviewerId: {
              projectId: project.id,
              reviewerId: input.actor.id,
            },
          },
          update: {
            recommendation:
              input.recommendation,
            comment: input.comment,
          },
          create: {
            projectId: project.id,
            reviewerId: input.actor.id,
            recommendation:
              input.recommendation,
            comment: input.comment,
          },
        });

      if (project.status === "SUBMITTED") {
        await transaction.communityProject.update({
          where: {
            id: project.id,
          },
          data: {
            status: "COMMANDER_REVIEW",
          },
        });

        await transaction.projectStatusHistory.create({
          data: {
            projectId: project.id,
            actorId: input.actor.id,
            fromStatus: "SUBMITTED",
            toStatus: "COMMANDER_REVIEW",
            reason:
              "First Commander review received",
          },
        });
      }

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel: input.actor.username,
          action:
            "COMMANDER_PROJECT_REVIEW_SUBMITTED",
          entityType: "PROJECT",
          entityId: project.id,
          reason: input.comment,
          outcome: input.recommendation,
          metadata: {
            projectTitle: project.title,
          },
        },
        transaction
      );

      return review;
    }
  );
}

export async function evaluateProjectAsTeam(
  input: {
    projectId: string;
    team: EvaluationTeam;
    recommendation: ProjectRecommendation;
    comment: string;
    scores: ScoreInput;
    actor: ProjectActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertTeamMember(
        {
          userId: input.actor.id,
          team: input.team,
        },
        transaction as typeof prisma
      );

      const project =
        await transaction.communityProject.findUnique({
          where: {
            id: input.projectId,
          },
          select: {
            id: true,
            title: true,
            status: true,
          },
        });

      if (!project) {
        throw createHttpError(
          "PROJECT_NOT_FOUND",
          404
        );
      }

      if (
        project.status !== "COMMANDER_REVIEW" &&
        project.status !== "SELECTED"
      ) {
        throw createHttpError(
          "PROJECT_NOT_OPEN_FOR_TEAM_EVALUATION",
          409
        );
      }

      const evaluationData = {
        recommendation: input.recommendation,
        comment: input.comment,
        utilityScore:
          input.scores.utilityScore ?? null,
        qualityScore:
          input.scores.qualityScore ?? null,
        impactScore:
          input.scores.impactScore ?? null,
        feasibilityScore:
          input.scores.feasibilityScore ?? null,
        sustainabilityScore:
          input.scores.sustainabilityScore ??
          null,
        integrationScore:
          input.scores.integrationScore ?? null,
      };

      const evaluation =
        await transaction.projectTeamEvaluation.upsert({
          where: {
            projectId_reviewerId_team: {
              projectId: project.id,
              reviewerId: input.actor.id,
              team: input.team,
            },
          },
          update: evaluationData,
          create: {
            projectId: project.id,
            reviewerId: input.actor.id,
            team: input.team,
            ...evaluationData,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel: input.actor.username,
          action:
            "PROJECT_TEAM_EVALUATION_SUBMITTED",
          entityType: "PROJECT",
          entityId: project.id,
          reason: input.comment,
          outcome: input.recommendation,
          metadata: {
            team: input.team,
            projectTitle: project.title,
          },
        },
        transaction
      );

      return evaluation;
    }
  );
}

export async function changeProjectStatus(
  input: {
    projectId: string;
    toStatus:
      | "SELECTED"
      | "IN_DEVELOPMENT"
      | "COMPLETED"
      | "REJECTED";
    reason: string;
    actor: ProjectActor;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertTeamMember(
        {
          userId: input.actor.id,
          team: "USER_MANAGEMENT",
        },
        transaction as typeof prisma
      );

      const project =
        await transaction.communityProject.findUnique({
          where: {
            id: input.projectId,
          },
          select: {
            id: true,
            title: true,
            status: true,
          },
        });

      if (!project) {
        throw createHttpError(
          "PROJECT_NOT_FOUND",
          404
        );
      }

      if (
        project.status === "COMPLETED" ||
        project.status === "REJECTED"
      ) {
        throw createHttpError(
          "PROJECT_ALREADY_FINAL",
          409
        );
      }

      if (
        input.toStatus === "SELECTED" ||
        input.toStatus === "REJECTED"
      ) {
        if (
          project.status !== "COMMANDER_REVIEW"
        ) {
          throw createHttpError(
            "PROJECT_MUST_COMPLETE_COMMANDER_REVIEW",
            409
          );
        }
      }

      if (input.toStatus === "SELECTED") {
        const userManagementSupport =
          await transaction.projectTeamEvaluation.count({
            where: {
              projectId: project.id,
              team: "USER_MANAGEMENT",
              recommendation: "SUPPORT",
            },
          });

        if (userManagementSupport === 0) {
          throw createHttpError(
            "USER_MANAGEMENT_SUPPORT_REQUIRED",
            409
          );
        }
      }

      if (
        input.toStatus === "IN_DEVELOPMENT" &&
        project.status !== "SELECTED"
      ) {
        throw createHttpError(
          "INVALID_PROJECT_STATUS_TRANSITION",
          409
        );
      }

      if (
        input.toStatus === "COMPLETED" &&
        project.status !== "IN_DEVELOPMENT"
      ) {
        throw createHttpError(
          "INVALID_PROJECT_STATUS_TRANSITION",
          409
        );
      }

      const updatedProject =
        await transaction.communityProject.update({
          where: {
            id: project.id,
          },
          data: {
            status:
              input.toStatus as ProjectStatus,
            completedAt:
              input.toStatus === "COMPLETED"
                ? new Date()
                : null,
          },
        });

      await transaction.projectStatusHistory.create({
        data: {
          projectId: project.id,
          actorId: input.actor.id,
          fromStatus: project.status,
          toStatus: input.toStatus,
          reason: input.reason,
        },
      });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel: input.actor.username,
          action:
            "PROJECT_STATUS_CHANGED",
          entityType: "PROJECT",
          entityId: project.id,
          reason: input.reason,
          outcome: input.toStatus,
          metadata: {
            previousStatus: project.status,
            newStatus: input.toStatus,
            projectTitle: project.title,
          },
        },
        transaction
      );

      return updatedProject;
    }
  );
}