import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import crypto from "crypto";

import { prisma } from "../shared/prisma.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../shared/email.js";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser
} from "../shared/session.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const Body = z.object({
      email: z.string().email(),
      username: z.string().min(3),
      password: z.string().min(8)
    });
    const body = Body.parse(req.body);

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] }
    });
    if (exists) return reply.code(409).send({ ok: false });

    const passwordHash = await argon2.hash(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        username: body.username,
        passwordHash,
        status: "PENDING"
      }
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    await sendVerificationEmail(user.email, rawToken);

    return reply.send({ ok: true });
  });

  app.get("/verify-email", async (req, reply) => {
    const token = z.string().parse((req.query as any).token);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash }
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.code(400).send({ ok: false });
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { status: "ACTIVE", emailVerifiedAt: new Date() }
      })
    ]);

    const { sessionKey, expiresAt } = await createSession(record.userId);
    setSessionCookie(reply, sessionKey, expiresAt);

    return reply.send({ ok: true });
  });

  // =========================
  // RESET PASSWORD
  // =========================

  app.post("/forgot-password", async (req, reply) => {
    const Body = z.object({
      email: z.string().email()
    });
    const { email } = Body.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (user && user.status === "ACTIVE") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        }
      });

      await sendPasswordResetEmail(user.email, rawToken);
    }

    // sempre 200 OK (anti user enumeration)
    return reply.send({ ok: true });
  });

  app.post("/reset-password", async (req, reply) => {
    const Body = z.object({
      token: z.string(),
      newPassword: z.string().min(8)
    });
    const { token, newPassword } = Body.parse(req.body);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.code(400).send({ ok: false });
    }

    const newPasswordHash = await argon2.hash(newPassword);

    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newPasswordHash }
      }),
      prisma.session.deleteMany({
        where: { userId: record.userId }
      })
    ]);

    return reply.send({ ok: true });
  });

  // =========================

  app.post("/logout", async (_req, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  // ✅ ME CON WALLET COLLEGATI
  app.get("/me", async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ ok: false });

    const wallets = await prisma.walletLink.findMany({
      where: {
        userId: user.id,
        unlinkedAt: null
      },
      select: {
        chainId: true,
        address: true
      }
    });

    return reply.send({
      ok: true,
      user: {
        ...user,
        wallets
      }
    });
  });
}
