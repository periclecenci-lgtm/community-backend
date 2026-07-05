import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createAuditEvent } from "../services/auditService.js";
import { prisma } from "../shared/prisma.js";
import { requireSessionUser } from "../shared/session.js";

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const listProjectsSchema = z.object({
  status: z
    .enum([
      "SUBMITTED",
      "COMMANDER_REVIEW",
      "SELECTED",
      "IN_DEVELOPMENT",
      "COMPLETED",
      "REJECTED",
    ])
    .optional(),

  take: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  skip: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
});

const createProjectSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3)
      .max(200),

    summary: z
      .string()
      .trim()
      .min(10)
      .max(1000),

    description: z
      .string()
      .trim()
      .min(20)
      .max(50_000),

    sourcePostId: z
      .string()
      .uuid()
      .optional(),
  })
  .strict();

export async function projectsRoutes(
  app: FastifyInstance
) {
  app.get("/", async (request) => {
    const query =
      listProjectsSchema.parse(
        request.query
      );

    const where = query.status
      ? {
          status: query.status,
        }
      : {};

    const [total, projects] =
      await Promise.all([
        prisma.communityProject.count({
          where,
        }),

        prisma.communityProject.findMany({
          where,
          orderBy: {
            submittedAt: "desc",
          },
          take: query.take,
          skip: query.skip,

          select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            submittedAt: true,
            updatedAt: true,
            completedAt: true,

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
              },
            },

            _count: {
              select: {
                likes: true,
                commanderReviews: true,
              },
            },
          },
        }),
      ]);

    return {
      ok: true,
      total,
      projects,
    };
  });

  app.get(
    "/:projectId",
    async (request, reply) => {
      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      const project =
        await prisma.communityProject.findUnique({
          where: {
            id: projectId,
          },

          select: {
            id: true,
            title: true,
            summary: true,
            description: true,
            status: true,
            submittedAt: true,
            updatedAt: true,
            completedAt: true,

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

            statusHistory: {
              orderBy: {
                createdAt: "asc",
              },
              select: {
                id: true,
                fromStatus: true,
                toStatus: true,
                reason: true,
                createdAt: true,

                actor: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
          },
        });

      if (!project) {
        return reply.code(404).send({
          ok: false,
          error: "PROJECT_NOT_FOUND",
        });
      }

      return {
        ok: true,
        project,
      };
    }
  );

  app.post("/", async (request, reply) => {
    const user =
      await requireSessionUser(request);

    const body =
      createProjectSchema.parse(
        request.body
      );

    const project =
      await prisma.$transaction(
        async (transaction) => {
          if (body.sourcePostId) {
            const sourcePost =
              await transaction.post.findUnique({
                where: {
                  id: body.sourcePostId,
                },
                select: {
                  id: true,
                  authorId: true,
                  isProposal: true,
                  visibility: true,
                  project: {
                    select: {
                      id: true,
                    },
                  },
                },
              });

            if (!sourcePost) {
              const error = new Error(
                "SOURCE_POST_NOT_FOUND"
              ) as Error & {
                statusCode: number;
              };

              error.statusCode = 404;
              throw error;
            }

            if (
              sourcePost.authorId !==
              user.id
            ) {
              const error = new Error(
                "SOURCE_POST_NOT_OWNED"
              ) as Error & {
                statusCode: number;
              };

              error.statusCode = 403;
              throw error;
            }

            if (
              !sourcePost.isProposal ||
              sourcePost.visibility !==
                "VISIBLE"
            ) {
              const error = new Error(
                "SOURCE_POST_NOT_ELIGIBLE"
              ) as Error & {
                statusCode: number;
              };

              error.statusCode = 409;
              throw error;
            }

            if (sourcePost.project) {
              const error = new Error(
                "SOURCE_POST_ALREADY_USED"
              ) as Error & {
                statusCode: number;
              };

              error.statusCode = 409;
              throw error;
            }
          }

          const createdProject =
            await transaction.communityProject.create({
              data: {
                authorId: user.id,
                sourcePostId:
                  body.sourcePostId ??
                  null,
                title: body.title,
                summary: body.summary,
                description:
                  body.description,
              },
            });

          await transaction.projectStatusHistory.create({
            data: {
              projectId:
                createdProject.id,
              actorId: user.id,
              fromStatus: null,
              toStatus: "SUBMITTED",
              reason:
                "Project submitted by community member",
            },
          });

          await createAuditEvent(
            {
              actorId: user.id,
              actorType: "USER",
              actorLabel:
                user.username,
              action:
                "COMMUNITY_PROJECT_SUBMITTED",
              entityType: "PROJECT",
              entityId:
                createdProject.id,
              reason:
                "Community project submission",
              outcome: "SUBMITTED",
              metadata: {
                projectTitle:
                  createdProject.title,
              },
            },
            transaction
          );

          return createdProject;
        }
      );

    return reply.code(201).send({
      ok: true,
      project,
    });
  });

  app.post(
    "/:projectId/like",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      const project =
        await prisma.communityProject.findUnique({
          where: {
            id: projectId,
          },
          select: {
            id: true,
          },
        });

      if (!project) {
        return reply.code(404).send({
          ok: false,
          error: "PROJECT_NOT_FOUND",
        });
      }

      await prisma.communityProjectLike.upsert({
        where: {
          projectId_userId: {
            projectId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          projectId,
          userId: user.id,
        },
      });

      const likes =
        await prisma.communityProjectLike.count({
          where: {
            projectId,
          },
        });

      return {
        ok: true,
        liked: true,
        likes,
      };
    }
  );

  app.delete(
    "/:projectId/like",
    async (request) => {
      const user =
        await requireSessionUser(request);

      const { projectId } =
        projectParamsSchema.parse(
          request.params
        );

      await prisma.communityProjectLike.deleteMany({
        where: {
          projectId,
          userId: user.id,
        },
      });

      const likes =
        await prisma.communityProjectLike.count({
          where: {
            projectId,
          },
        });

      return {
        ok: true,
        liked: false,
        likes,
      };
    }
  );
}