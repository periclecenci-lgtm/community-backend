import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../shared/prisma.js";
import { requireSessionUser } from "../shared/session.js";

export async function boardsRoutes(app: FastifyInstance) {
  // Tutte le rotte richiedono sessione
  app.addHook("preHandler", async (req) => {
    await requireSessionUser(req);
  });

  // =========================
  // READ
  // =========================

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

  // =========================
  // WRITE
  // =========================

  // POST /api/boards/:slug/posts
  app.post("/:slug/posts", async (req, reply) => {
    const user = await requireSessionUser(req);

    const Params = z.object({
      slug: z.string(),
    });

    const Body = z.object({
      title: z.string().min(3).max(120),
      content: z.string().min(10),
      isProposal: z.boolean().optional(),
    });

    const { slug } = Params.parse(req.params);
    const body = Body.parse(req.body);

    const board = await prisma.board.findUnique({
      where: { slug },
    });

    if (!board) {
      return reply.code(404).send({ ok: false, code: "BOARD_NOT_FOUND" });
    }

    // Solo Commander possono creare proposal
    const isCommander = user.role === "ADMIN"; // placeholder: sarà sostituito dal gating reale
    const isProposal = body.isProposal === true && isCommander;

    const post = await prisma.post.create({
      data: {
        boardId: board.id,
        authorId: user.id,
        title: body.title,
        content: body.content,
        isProposal,
      },
    });

    return reply.send({ ok: true, postId: post.id });
  });

  // POST /api/posts/:id/comments
  app.post("/post/:id/comments", async (req, reply) => {
    const user = await requireSessionUser(req);

    const Params = z.object({
      id: z.string(),
    });

    const Body = z.object({
      content: z.string().min(2).max(2000),
    });

    const { id } = Params.parse(req.params);
    const body = Body.parse(req.body);

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return reply.code(404).send({ ok: false, code: "POST_NOT_FOUND" });
    }

    await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: user.id,
        content: body.content,
      },
    });

    return reply.send({ ok: true });
  });
}
