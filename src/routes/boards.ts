import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../shared/prisma.js";
import {
  requireAdmin,
  requireSessionUser,
} from "../shared/session.js";

const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const boardParamsSchema = z.object({
  slug: slugSchema,
});

const postParamsSchema = z.object({
  postId: z.string().uuid(),
});

const createBoardSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(1000),
});

const createPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
  isProposal: z.boolean().optional().default(false),
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export async function boardsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.board.findMany({
      orderBy: {
        title: "asc",
      },
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
    });
  });

  app.post("/", async (request, reply) => {
    await requireAdmin(request);

    const body = createBoardSchema.parse(request.body);

    const board = await prisma.board.create({
      data: body,
    });

    return reply.code(201).send({
      board,
    });
  });

  app.get("/:slug/posts", async (request, reply) => {
    const { slug } = boardParamsSchema.parse(request.params);

    const board = await prisma.board.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        posts: {
          orderBy: {
            createdAt: "desc",
          },
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
              select: {
                comments: true,
              },
            },
          },
        },
      },
    });

    if (!board) {
      return reply.code(404).send({
        error: "Board not found",
      });
    }

    const { posts, ...boardDetails } = board;

    return {
      board: boardDetails,
      posts,
    };
  });

  app.post("/:slug/posts", async (request, reply) => {
    const user = await requireSessionUser(request);
    const { slug } = boardParamsSchema.parse(request.params);
    const body = createPostSchema.parse(request.body);

    const board = await prisma.board.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      return reply.code(404).send({
        error: "Board not found",
      });
    }

    const post = await prisma.post.create({
      data: {
        title: body.title,
        content: body.content,
        isProposal: body.isProposal,
        authorId: user.id,
        boardId: board.id,
      },
    });

    return reply.code(201).send({
      postId: post.id,
      post,
    });
  });

  app.get("/post/:postId", async (request, reply) => {
    const { postId } = postParamsSchema.parse(request.params);

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        board: {
          select: {
            id: true,
            slug: true,
            title: true,
          },
        },
        comments: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
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
      return reply.code(404).send({
        error: "Post not found",
      });
    }

    return {
      post,
    };
  });

  app.post("/post/:postId/comments", async (request, reply) => {
    const user = await requireSessionUser(request);
    const { postId } = postParamsSchema.parse(request.params);
    const body = createCommentSchema.parse(request.body);

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      return reply.code(404).send({
        error: "Post not found",
      });
    }

    const comment = await prisma.comment.create({
      data: {
        content: body.content,
        authorId: user.id,
        postId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return reply.code(201).send({
      comment,
    });
  });
}