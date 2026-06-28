import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../shared/prisma.js";
import { requireAdmin } from "../shared/session.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/me", async (req) => {
    const admin = await requireAdmin(req);

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

  app.get("/dashboard", async (req) => {
    await requireAdmin(req);

    const [
      usersTotal,
      usersActive,
      usersPending,
      usersSuspended,
      boardsTotal,
      postsTotal,
      commentsTotal,
      walletsLinked,
      commandersTotal,
      commandersActive,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.board.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.walletLink.count({ where: { unlinkedAt: null } }),
      prisma.commanderStatus.count(),
      prisma.commanderStatus.count({ where: { isCommander: true } }),
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
        },
        wallet: {
          linked: walletsLinked,
        },
        commander: {
          totalRecords: commandersTotal,
          activeCommanders: commandersActive,
        },
      },
    };
  });

  app.get("/users", async (req) => {
    await requireAdmin(req);

    const Query = z.object({
      q: z.string().optional(),
      status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]).optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
      take: z.coerce.number().int().min(1).max(100).default(50),
      skip: z.coerce.number().int().min(0).default(0),
    });

    const query = Query.parse(req.query);

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: "insensitive" as const } },
              { username: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
            where: { unlinkedAt: null },
            select: {
              chainId: true,
              address: true,
              linkedAt: true,
            },
          },
          commanderStatuses: {
            orderBy: { lastCheckedAt: "desc" },
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
        },
      }),
    ]);

    return {
      ok: true,
      total,
      users,
    };
  });

  app.get("/users/:id", async (req, reply) => {
    await requireAdmin(req);

    const Params = z.object({
      id: z.string().uuid(),
    });

    const { id } = Params.parse(req.params);

    const user = await prisma.user.findUnique({
      where: { id },
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
          orderBy: { linkedAt: "desc" },
          select: {
            id: true,
            chainId: true,
            address: true,
            linkedAt: true,
            unlinkedAt: true,
          },
        },
        commanderStatuses: {
          orderBy: { lastCheckedAt: "desc" },
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
        posts: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            title: true,
            boardId: true,
            createdAt: true,
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            postId: true,
            content: true,
            createdAt: true,
          },
        },
        sessions: {
          orderBy: { createdAt: "desc" },
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
  });

  app.patch("/users/:id/status", async (req, reply) => {
    const admin = await requireAdmin(req);

    const Params = z.object({
      id: z.string().uuid(),
    });

    const Body = z.object({
      status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]),
    });

    const { id } = Params.parse(req.params);
    const body = Body.parse(req.body);

    if (admin.id === id && body.status !== "ACTIVE") {
      return reply.code(400).send({
        ok: false,
        error: "ADMIN_CANNOT_DISABLE_SELF",
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status: body.status },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        role: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      user,
    };
  });

  app.patch("/users/:id/role", async (req, reply) => {
    const admin = await requireAdmin(req);

    const Params = z.object({
      id: z.string().uuid(),
    });

    const Body = z.object({
      role: z.enum(["USER", "ADMIN"]),
    });

    const { id } = Params.parse(req.params);
    const body = Body.parse(req.body);

    if (admin.id === id && body.role !== "ADMIN") {
      return reply.code(400).send({
        ok: false,
        error: "ADMIN_CANNOT_DEMOTE_SELF",
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        role: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      user,
    };
  });
}