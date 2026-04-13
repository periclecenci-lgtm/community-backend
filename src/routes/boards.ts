import { Router, Request, Response } from "express";
import { prisma } from "../shared/prisma.js";

const router = Router();

// GET /boards
router.get("/", async (_req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    include: {
      posts: true,
    },
  });

  res.json(boards);
});

// GET /boards/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

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
    return res.status(404).json({ error: "Board not found" });
  }

  res.json(board);
});

// POST /boards
router.post("/", async (req: Request, res: Response) => {
  const { title } = req.body;

  const board = await prisma.board.create({
    data: { title },
  });

  res.json(board);
});

// POST /boards/:id/posts
router.post("/:id/posts", async (req: Request, res: Response) => {
  const boardId = String(req.params.id);
  const { title, content, authorId } = req.body;

  const post = await prisma.post.create({
    data: {
      title,
      content,
      authorId,
      boardId,
    },
  });

  res.json(post);
});

// POST /posts/:id/comments
router.post("/posts/:id/comments", async (req: Request, res: Response) => {
  const postId = String(req.params.id);
  const { content, authorId } = req.body;

  const comment = await prisma.comment.create({
    data: {
      content,
      authorId,
      postId,
    },
  });

  res.json(comment);
});

export default router;