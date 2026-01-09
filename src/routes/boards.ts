import type { FastifyInstance } from "fastify";
import { prisma } from "../shared/prisma.js";
import { requireSessionUser } from "../shared/session.js";

export async function boardsRoutes(app: FastifyInstance) {
  // Tutte le rotte richiedono sessione
  app.addHook("preHandler", async (req) => {
    await requireSessionUser(req);
  });

  // GET /api/boards
  app.get("/", async () => {
    const boards = await prisma.board.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
      },
    });

    return { ok: true, boards };
  });

  // GET /api/boards/:slug/posts
  app.get("/:slug/posts", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const board = await prisma.board.findUnique({
      where: { slug },
    });

    if (!board) {
      return reply.code(404).send({ ok: false, code: "BOARD_NOT_FOUND" });
    }

    const posts = await prisma.post.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        isProposal: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    return {
      ok: true,
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        description: board.description,
      },
      posts,
    };
  });

  // GET /api/boards/post/:id
  app.get("/post/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        isProposal: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      return reply.code(404).send({ ok: false, code: "POST_NOT_FOUND" });
    }

    return { ok: true, post };
  });
}
