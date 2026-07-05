import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createAuditEvent } from "../services/auditService.js";
import { prisma } from "../shared/prisma.js";
import { requireAdmin } from "../shared/session.js";

const userParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateRoleSchema = z
  .object({
    role: z.enum([
      "USER",
      "ADMIN",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(1000),
  })
  .strict();

export async function adminRoutes(
  app: FastifyInstance
) {
  app.get("/me", async (request) => {
    const admin =
      await requireAdmin(request);

    return {
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        status: admin.status,
      },
    };
  });

  app.get(
    "/dashboard",
    async (request) => {
      await requireAdmin(request);

      const [
        usersTotal,
        usersActive,
        usersPending,
        usersSuspended,
        boardsTotal,
        postsTotal,
        commentsTotal,
        walletsLinked,
        commanderRecords,
        activeCommanderUsers,
        openModerationCases,
        openReports,
        openDisciplinaryCases,
        projectsTotal,
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

        prisma.board.count(),
        prisma.post.count(),
        prisma.comment.count(),

        prisma.walletLink.count({
          where: {
            unlinkedAt: null,
          },
        }),

        prisma.commanderStatus.count(),

        prisma.commanderStatus.findMany({
          where: {
            isCommander: true,
          },
          distinct: ["userId"],
          select: {
            userId: true,
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

        prisma.communityProject.count(),
      ]);

      return {
        ok: true,
        dashboard: {
          users: {
            total: usersTotal,
            active: usersActive,
            pending: usersPending,
            suspended: usersSuspended,
          },

          community: {
            boards: boardsTotal,
            posts: postsTotal,
            comments: commentsTotal,
            projects: projectsTotal,
          },

          wallet: {
            linked: walletsLinked,
          },

          commander: {
            totalRecords:
              commanderRecords,
            activeCommanders:
              activeCommanderUsers.length,
          },

          governance: {
            openModerationCases,
            openReports,
            openDisciplinaryCases,
          },
        },
      };
    }
  );

  app.get("/users", async (request) => {
    await requireAdmin(request);

    const querySchema = z.object({
      q: z.string().optional(),

      status: z
        .enum([
          "PENDING",
          "ACTIVE",
          "SUSPENDED",
        ])
        .optional(),

      role: z
        .enum([
          "USER",
          "ADMIN",
        ])
        .optional(),

      take: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50),

      skip: z.coerce
        .number()
        .int()
        .min(0)
        .default(0),
    });

    const query =
      querySchema.parse(request.query);

    const where = {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),

      ...(query.role
        ? {
            role: query.role,
          }
        : {}),

      ...(query.q
        ? {
            OR: [
              {
                email: {
                  contains: query.q,
                  mode:
                    "insensitive" as const,
                },
              },
              {
                username: {
                  contains: query.q,
                  mode:
                    "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [total, users] =
      await Promise.all([
        prisma.user.count({
          where,
        }),

        prisma.user.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          skip: query.skip,
          take: query.take,

          select: {
            id: true,
            email: true,
            username: true,
            status: true,
            role: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,

            walletLinks: {
              where: {
                unlinkedAt: null,
              },
              select: {
                chainId: true,
                address: true,
                linkedAt: true,
              },
            },

            commanderStatuses: {
              orderBy: {
                lastCheckedAt: "desc",
              },
              take: 1,
              select: {
                isCommander: true,
                reason: true,
                lastCheckedAt: true,
                balanceAtomic: true,
                requiredThresholdUsd: true,
                chainId: true,
                address: true,
              },
            },

            teamMemberships: {
              where: {
                endedAt: null,
              },
              select: {
                team: true,
                appointedAt: true,
              },
            },
          },
        }),
      ]);

    return {
      ok: true,
      total,
      users,
    };
  });

  app.get(
    "/users/:id",
    async (request, reply) => {
      await requireAdmin(request);

      const { id } =
        userParamsSchema.parse(
          request.params
        );

      const user =
        await prisma.user.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
            email: true,
            username: true,
            status: true,
            role: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,

            walletLinks: {
              orderBy: {
                linkedAt: "desc",
              },
              select: {
                id: true,
                chainId: true,
                address: true,
                linkedAt: true,
                unlinkedAt: true,
              },
            },

            commanderStatuses: {
              orderBy: {
                lastCheckedAt: "desc",
              },
              select: {
                id: true,
                chainId: true,
                address: true,
                isCommander: true,
                reason: true,
                balanceAtomic: true,
                requiredThresholdUsd: true,
                lastCheckedAt: true,
                lastEligibleAt: true,
                lastIneligibleAt: true,
              },
            },

            teamMemberships: {
              orderBy: {
                appointedAt: "desc",
              },
              select: {
                id: true,
                team: true,
                appointedAt: true,
                endedAt: true,
                endReason: true,
              },
            },

            disciplinaryCases: {
              orderBy: {
                openedAt: "desc",
              },
              take: 20,
              select: {
                id: true,
                type: true,
                status: true,
                reason: true,
                openedAt: true,
                resolvedAt: true,
              },
            },

            posts: {
              orderBy: {
                createdAt: "desc",
              },
              take: 20,
              select: {
                id: true,
                title: true,
                boardId: true,
                visibility: true,
                createdAt: true,
              },
            },

            comments: {
              orderBy: {
                createdAt: "desc",
              },
              take: 20,
              select: {
                id: true,
                postId: true,
                content: true,
                visibility: true,
                createdAt: true,
              },
            },

            sessions: {
              orderBy: {
                createdAt: "desc",
              },
              take: 20,
              select: {
                id: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
              },
            },
          },
        });

      if (!user) {
        return reply.code(404).send({
          ok: false,
          error: "USER_NOT_FOUND",
        });
      }

      return {
        ok: true,
        user,
      };
    }
  );

  app.patch(
    "/users/:id/role",
    async (request, reply) => {
      const admin =
        await requireAdmin(request);

      const { id } =
        userParamsSchema.parse(
          request.params
        );

      const body =
        updateRoleSchema.parse(
          request.body
        );

      if (
        admin.id === id &&
        body.role !== "ADMIN"
      ) {
        return reply.code(400).send({
          ok: false,
          error:
            "ADMIN_CANNOT_DEMOTE_SELF",
        });
      }

      const existingUser =
        await prisma.user.findUnique({
          where: {
            id,
          },
          select: {
            id: true,
            username: true,
            role: true,
          },
        });

      if (!existingUser) {
        return reply.code(404).send({
          ok: false,
          error: "USER_NOT_FOUND",
        });
      }

      const user =
        await prisma.$transaction(
          async (transaction) => {
            const updatedUser =
              await transaction.user.update({
                where: {
                  id,
                },
                data: {
                  role: body.role,
                },
                select: {
                  id: true,
                  email: true,
                  username: true,
                  status: true,
                  role: true,
                  updatedAt: true,
                },
              });

            await createAuditEvent(
              {
                actorId: admin.id,
                actorType: "USER",
                actorLabel:
                  admin.username,
                action:
                  "TECHNICAL_ROLE_CHANGED",
                entityType: "USER",
                entityId: id,
                reason: body.reason,
                outcome: body.role,
                metadata: {
                  previousRole:
                    existingUser.role,
                  newRole:
                    body.role,
                  targetUsername:
                    existingUser.username,
                },
              },
              transaction
            );

            return updatedUser;
          }
        );

      return {
        ok: true,
        user,
      };
    }
  );
}