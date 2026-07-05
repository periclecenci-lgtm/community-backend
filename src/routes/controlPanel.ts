import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getCommunityAccess } from "../services/communityAccessService.js";
import { getControlPanelDashboard } from "../services/controlPanelDashboardService.js";
import {
  getModerationDashboard,
  resolveModerationCase,
  temporarilyHideComment,
  temporarilyHidePost,
} from "../services/controlPanelModerationService.js";
import {
  createCommunityReport,
  getReportsDashboard,
  resolveCommunityReport,
  takeReportForReview,
} from "../services/controlPanelReportService.js";
import {
  castDisciplinaryVote,
  getUserManagementDashboard,
  openDisciplinaryCase,
} from "../services/controlPanelUserService.js";
import { getProjectsDashboard } from "../services/controlPanelProjectService.js";
import { requireSessionUser } from "../shared/session.js";

const postParamsSchema = z.object({
  postId: z.string().uuid(),
});

const commentParamsSchema = z.object({
  commentId: z.string().uuid(),
});

const moderationCaseParamsSchema = z.object({
  caseId: z.string().uuid(),
});

const reportParamsSchema = z.object({
  reportId: z.string().uuid(),
});

const userParamsSchema = z.object({
  userId: z.string().uuid(),
});

const disciplinaryCaseParamsSchema = z.object({
  caseId: z.string().uuid(),
});

const moderationReasonSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

const resolveModerationSchema = z
  .object({
    decision: z.enum([
      "CONFIRM",
      "RESTORE",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

const createReportSchema = z
  .object({
    targetType: z.enum([
      "USER",
      "POST",
      "COMMENT",
      "PROJECT",
    ]),
    targetId: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(1000),
    details: z
      .string()
      .trim()
      .min(5)
      .max(5000)
      .optional(),
  })
  .strict();

const resolveReportSchema = z
  .object({
    resolution: z.enum([
      "RESOLVE",
      "ESCALATE",
      "REJECT",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

const openDisciplinaryCaseSchema = z
  .object({
    type: z.enum([
      "SUSPENSION",
      "REINSTATEMENT",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
    sourceReportId: z
      .string()
      .uuid()
      .optional(),
  })
  .strict();

const disciplinaryVoteSchema = z
  .object({
    vote: z.enum([
      "APPROVE",
      "REJECT",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000)
      .optional(),
  })
  .strict();

export async function controlPanelRoutes(
  app: FastifyInstance
) {
  app.get("/", async (request, reply) => {
    const user =
      await requireSessionUser(request);

    const { permissions } =
      await getCommunityAccess(user);

    if (!permissions.communityControlPanel) {
      return reply.code(403).send({
        ok: false,
        error:
          "CONTROL_PANEL_ACCESS_DENIED",
      });
    }

    const sections = [
      permissions.communityVote &&
        "communityVoting",

      permissions.moderatePosts &&
        "postModeration",

      permissions.moderateComments &&
        "commentModeration",

      permissions.createReports &&
        "reportSubmission",

      permissions.reviewReports &&
        "reportReview",

      permissions.resolveModeration &&
        "moderationResolution",

      permissions.manageUsers &&
        "userManagement",

      permissions.reviewProjects &&
        "projectReview",

      permissions.manageProjects &&
        "projectManagement",

      permissions.technicalProjectAssessment &&
        "technicalProjectAssessment",

      permissions.selectSpecializedTeams &&
        "specializedTeamSelection",

      permissions.daoCouncil &&
        "daoCouncil",

      permissions.protocolGovernance &&
        "protocolGovernance",

      permissions.protocolTechnicalAssessment &&
        "protocolTechnicalAssessment",

      permissions.implementProtocolDecision &&
        "protocolImplementation",

      permissions.developmentTools &&
        "developmentTools",

      permissions.technicalAdministration &&
        "technicalAdministration",
    ].filter(
      (section): section is string =>
        Boolean(section)
    );

    return {
      ok: true,
      controlPanel: {
        name:
          "Community Control Platform",
        interfaceName:
          "Community Control Panel",
        sections,
        permissions,
      },
    };
  });

  app.get(
    "/dashboard",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (
        !permissions.communityControlPanel
      ) {
        return reply.code(403).send({
          ok: false,
          error:
            "CONTROL_PANEL_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        dashboard:
          await getControlPanelDashboard(),
        permissions,
      };
    }
  );

  app.get(
    "/moderation",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (
        !permissions.moderatePosts &&
        !permissions.moderateComments &&
        !permissions.resolveModeration
      ) {
        return reply.code(403).send({
          ok: false,
          error:
            "MODERATION_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        moderation:
          await getModerationDashboard(),
        permissions,
      };
    }
  );

  app.post(
    "/moderation/posts/:postId/hide",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.moderatePosts) {
        return reply.code(403).send({
          ok: false,
          error:
            "POST_MODERATION_ACCESS_DENIED",
        });
      }

      const { postId } =
        postParamsSchema.parse(
          request.params
        );

      const { reason } =
        moderationReasonSchema.parse(
          request.body
        );

      const moderationCase =
        await temporarilyHidePost({
          postId,
          reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        moderationCase,
      });
    }
  );

  app.post(
    "/moderation/comments/:commentId/hide",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.moderateComments) {
        return reply.code(403).send({
          ok: false,
          error:
            "COMMENT_MODERATION_ACCESS_DENIED",
        });
      }

      const { commentId } =
        commentParamsSchema.parse(
          request.params
        );

      const { reason } =
        moderationReasonSchema.parse(
          request.body
        );

      const moderationCase =
        await temporarilyHideComment({
          commentId,
          reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        moderationCase,
      });
    }
  );

  app.post(
    "/moderation/cases/:caseId/resolve",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.resolveModeration) {
        return reply.code(403).send({
          ok: false,
          error:
            "MODERATION_RESOLUTION_ACCESS_DENIED",
        });
      }

      const { caseId } =
        moderationCaseParamsSchema.parse(
          request.params
        );

      const body =
        resolveModerationSchema.parse(
          request.body
        );

      const moderationCase =
        await resolveModerationCase({
          caseId,
          decision: body.decision,
          reason: body.reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        moderationCase,
      };
    }
  );

  app.get(
    "/reports",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.reviewReports) {
        return reply.code(403).send({
          ok: false,
          error:
            "REPORT_REVIEW_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        reports:
          await getReportsDashboard(),
        permissions,
      };
    }
  );

  app.post(
    "/reports",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.createReports) {
        return reply.code(403).send({
          ok: false,
          error:
            "REPORT_CREATION_ACCESS_DENIED",
        });
      }

      const body =
        createReportSchema.parse(
          request.body
        );

      const report =
        await createCommunityReport({
          targetType: body.targetType,
          targetId: body.targetId,
          reason: body.reason,

          ...(body.details !== undefined
            ? {
                details:
                  body.details,
              }
            : {}),

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        report,
      });
    }
  );

  app.post(
    "/reports/:reportId/review",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.reviewReports) {
        return reply.code(403).send({
          ok: false,
          error:
            "REPORT_REVIEW_ACCESS_DENIED",
        });
      }

      const { reportId } =
        reportParamsSchema.parse(
          request.params
        );

      const report =
        await takeReportForReview({
          reportId,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        report,
      };
    }
  );

  app.post(
    "/reports/:reportId/resolve",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.reviewReports) {
        return reply.code(403).send({
          ok: false,
          error:
            "REPORT_REVIEW_ACCESS_DENIED",
        });
      }

      const { reportId } =
        reportParamsSchema.parse(
          request.params
        );

      const body =
        resolveReportSchema.parse(
          request.body
        );

      const report =
        await resolveCommunityReport({
          reportId,
          resolution:
            body.resolution,
          reason: body.reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        report,
      };
    }
  );

  app.get(
    "/users",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.manageUsers) {
        return reply.code(403).send({
          ok: false,
          error:
            "USER_MANAGEMENT_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        users:
          await getUserManagementDashboard(),
        permissions,
      };
    }
  );

  app.post(
    "/users/:userId/cases",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.manageUsers) {
        return reply.code(403).send({
          ok: false,
          error:
            "USER_MANAGEMENT_ACCESS_DENIED",
        });
      }

      const { userId } =
        userParamsSchema.parse(
          request.params
        );

      const body =
        openDisciplinaryCaseSchema.parse(
          request.body
        );

      const disciplinaryCase =
        await openDisciplinaryCase({
          subjectUserId: userId,
          type: body.type,
          reason: body.reason,

          ...(body.sourceReportId !==
          undefined
            ? {
                sourceReportId:
                  body.sourceReportId,
              }
            : {}),

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        disciplinaryCase,
      });
    }
  );

  app.post(
    "/users/cases/:caseId/votes",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.manageUsers) {
        return reply.code(403).send({
          ok: false,
          error:
            "USER_MANAGEMENT_ACCESS_DENIED",
        });
      }

      const { caseId } =
        disciplinaryCaseParamsSchema.parse(
          request.params
        );

      const body =
        disciplinaryVoteSchema.parse(
          request.body
        );

      const result =
        await castDisciplinaryVote({
          caseId,
          vote: body.vote,

          ...(body.reason !== undefined
            ? {
                reason:
                  body.reason,
              }
            : {}),

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        result,
      });
    }
  );

  app.get(
    "/projects",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (
        !permissions.reviewProjects &&
        !permissions.manageProjects &&
        !permissions.technicalProjectAssessment
      ) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROJECT_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        projects:
          await getProjectsDashboard(),
        permissions,
      };
    }
  );
}