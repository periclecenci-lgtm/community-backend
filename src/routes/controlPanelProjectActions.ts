import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getCommunityAccess } from "../services/communityAccessService.js";
import {
  changeProjectStatus,
  evaluateProjectAsTeam,
  reviewProjectAsCommander,
} from "../services/controlPanelProjectService.js";
import { requireSessionUser } from "../shared/session.js";

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const commanderReviewSchema = z
  .object({
    recommendation: z.enum([
      "SUPPORT",
      "NEUTRAL",
      "OPPOSE",
    ]),
    comment: z
      .string()
      .trim()
      .min(5)
      .max(5000),
  })
  .strict();

const teamEvaluationSchema = z
  .object({
    team: z.enum([
      "USER_MANAGEMENT",
      "DEVELOPMENT",
    ]),

    recommendation: z.enum([
      "SUPPORT",
      "NEUTRAL",
      "OPPOSE",
    ]),

    comment: z
      .string()
      .trim()
      .min(5)
      .max(5000),

    utilityScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    qualityScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    impactScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    feasibilityScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    sustainabilityScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),

    integrationScore: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.team ===
      "USER_MANAGEMENT"
    ) {
      if (
        value.utilityScore === undefined ||
        value.qualityScore === undefined ||
        value.impactScore === undefined
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          message:
            "User Management evaluation requires utilityScore, qualityScore and impactScore",
        });
      }
    }

    if (
      value.team === "DEVELOPMENT"
    ) {
      if (
        value.feasibilityScore ===
          undefined ||
        value.sustainabilityScore ===
          undefined ||
        value.integrationScore ===
          undefined
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          message:
            "Development evaluation requires feasibilityScore, sustainabilityScore and integrationScore",
        });
      }
    }
  });

const changeStatusSchema = z
  .object({
    toStatus: z.enum([
      "SELECTED",
      "IN_DEVELOPMENT",
      "COMPLETED",
      "REJECTED",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

export async function controlPanelProjectActionsRoutes(
  app: FastifyInstance
) {
  app.post(
    "/:projectId/commander-review",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.reviewProjects) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROJECT_REVIEW_ACCESS_DENIED",
        });
      }

      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      const body =
        commanderReviewSchema.parse(
          request.body
        );

      const review =
        await reviewProjectAsCommander({
          projectId,
          recommendation:
            body.recommendation,
          comment: body.comment,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        review,
      });
    }
  );

  app.post(
    "/:projectId/team-evaluation",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      const body =
        teamEvaluationSchema.parse(
          request.body
        );

      const canEvaluate =
        body.team ===
        "USER_MANAGEMENT"
          ? permissions.manageProjects
          : permissions
              .technicalProjectAssessment;

      if (!canEvaluate) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROJECT_EVALUATION_ACCESS_DENIED",
        });
      }

      const evaluation =
        await evaluateProjectAsTeam({
          projectId,
          team: body.team,
          recommendation:
            body.recommendation,
          comment: body.comment,

          scores: {
            ...(body.utilityScore !==
            undefined
              ? {
                  utilityScore:
                    body.utilityScore,
                }
              : {}),

            ...(body.qualityScore !==
            undefined
              ? {
                  qualityScore:
                    body.qualityScore,
                }
              : {}),

            ...(body.impactScore !==
            undefined
              ? {
                  impactScore:
                    body.impactScore,
                }
              : {}),

            ...(body.feasibilityScore !==
            undefined
              ? {
                  feasibilityScore:
                    body.feasibilityScore,
                }
              : {}),

            ...(body.sustainabilityScore !==
            undefined
              ? {
                  sustainabilityScore:
                    body.sustainabilityScore,
                }
              : {}),

            ...(body.integrationScore !==
            undefined
              ? {
                  integrationScore:
                    body.integrationScore,
                }
              : {}),
          },

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        evaluation,
      });
    }
  );

  app.post(
    "/:projectId/status",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.manageProjects) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROJECT_MANAGEMENT_ACCESS_DENIED",
        });
      }

      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      const body =
        changeStatusSchema.parse(
          request.body
        );

      const project =
        await changeProjectStatus({
          projectId,
          toStatus: body.toStatus,
          reason: body.reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        project,
      };
    }
  );
}