import type { FastifyInstance } from "fastify";
import { prisma } from "../shared/prisma.js";

export async function boardsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.board.findMany({
      include: {
        posts: true,
      },
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        posts: {
          include: {
            comments: true,
          },
        },
      },
    });

    if (!board) {
      return reply.status(404).send({ error: "Board not found" });
    }

    return board;
  });

  app.post("/", async (request) => {
    const { title } = request.body as { title: string };

    return prisma.board.create({
      data: { title },
    });
  });

  app.post("/:id/posts", async (request) => {
    const { id } = request.params as { id: string };
    const { title, content, authorId } = request.body as {
      title: string;
      content: string;
      authorId: string;
    };

    return prisma.post.create({
      data: {
        title,
        content,
        authorId,
        boardId: id,
      },
    });
  });

  app.post("/posts/:id/comments", async (request) => {
    const { id } = request.params as { id: string };
    const { content, authorId } = request.body as {
      content: string;
      authorId: string;
    };

    return prisma.comment.create({
      data: {
        content,
        authorId,
        postId: id,
      },
    });
  });
}