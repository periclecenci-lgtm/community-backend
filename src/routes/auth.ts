import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import crypto from "crypto";

import { prisma } from "../shared/prisma.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../shared/email.js";
import { generateToken } from "../shared/tokens.js";
import {
  clearSessionCookie,
  createSession,
  getSessionUser,
  setSessionCookie,
} from "../shared/session.js";

const registerSchema = z
  .object({
    email: z.string().trim().email().max(320),
    username: z.string().trim().min(3).max(50),
    password: z.string().min(8).max(200),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

const emailSchema = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(500),
    newPassword: z.string().min(8).max(200),
  })
  .strict();

const tokenQuerySchema = z.object({
  token: z.string().min(1).max(500),
});

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          {
            email,
          },
          {
            username: body.username,
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return reply.code(409).send({
        ok: false,
        error: "Email or username already registered",
      });
    }

    const passwordHash = await argon2.hash(body.password);
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email,
          username: body.username,
          passwordHash,
          status: "PENDING",
          emailVerifiedAt: null,
        },
      });

      await transaction.emailVerificationToken.create({
        data: {
          userId: createdUser.id,
          tokenHash: token.hash,
          expiresAt,
        },
      });

      return createdUser;
    });

    try {
      await sendVerificationEmail(user.email, token.raw);
    } catch (error) {
      app.log.error(
        { error, userId: user.id },
        "Unable to send verification email"
      );

      return reply.code(503).send({
        ok: false,
        error:
          "Account created, but the verification email could not be sent. Try resending it later.",
      });
    }

    return reply.code(201).send({
      ok: true,
      message:
        "Registration completed. Check your email to verify the account.",
    });
  });

  app.post("/resend-verification", async (request, reply) => {
    const body = emailSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (
      !user ||
      user.status !== "PENDING" ||
      user.emailVerifiedAt
    ) {
      return reply.send({
        ok: true,
        message:
          "If the account requires verification, a new email will be sent.",
      });
    }

    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    await prisma.$transaction([
      prisma.emailVerificationToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      }),
      prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
        },
      }),
    ]);

    try {
      await sendVerificationEmail(user.email, token.raw);
    } catch (error) {
      app.log.error(
        { error, userId: user.id },
        "Unable to resend verification email"
      );
    }

    return reply.send({
      ok: true,
      message:
        "If the account requires verification, a new email will be sent.",
    });
  });

  app.get("/verify-email", async (request, reply) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const tokenHash = hashToken(token);

    const record =
      await prisma.emailVerificationToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      return reply.code(400).send({
        ok: false,
        error: "Verification link is invalid or expired",
      });
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: {
          id: record.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: {
          id: record.userId,
        },
        data: {
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      }),
    ]);

    const { sessionKey, expiresAt } = await createSession(
      record.userId
    );

    setSessionCookie(reply, sessionKey, expiresAt);

    return reply.send({
      ok: true,
      message: "Email verified successfully",
    });
  });

  app.post("/forgot-password", async (request, reply) => {
    const body = emailSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (user && user.status === "ACTIVE") {
      const token = generateToken();
      const expiresAt = new Date(
        Date.now() + 60 * 60 * 1000
      );

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: token.hash,
            expiresAt,
          },
        }),
      ]);

      try {
        await sendPasswordResetEmail(
          user.email,
          token.raw
        );
      } catch (error) {
        app.log.error(
          { error, userId: user.id },
          "Unable to send password reset email"
        );
      }
    }

    return reply.send({
      ok: true,
      message:
        "If an active account exists for this email, reset instructions will be sent.",
    });
  });

  app.post("/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const record =
      await prisma.passwordResetToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      return reply.code(400).send({
        ok: false,
        error: "Reset link is invalid or expired",
      });
    }

    const passwordHash = await argon2.hash(
      body.newPassword
    );

    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: {
          id: record.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: {
          id: record.userId,
        },
        data: {
          passwordHash,
        },
      }),
      prisma.session.deleteMany({
        where: {
          userId: record.userId,
        },
      }),
    ]);

    return reply.send({
      ok: true,
      message: "Password updated successfully",
    });
  });

  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: "Invalid credentials",
      });
    }

    const passwordIsValid = await argon2.verify(
      user.passwordHash,
      body.password
    );

    if (!passwordIsValid) {
      return reply.code(401).send({
        ok: false,
        error: "Invalid credentials",
      });
    }

    if (
      user.status === "PENDING" ||
      !user.emailVerifiedAt
    ) {
      return reply.code(403).send({
        ok: false,
        error: "Verify your email before logging in",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (user.status !== "ACTIVE") {
      return reply.code(403).send({
        ok: false,
        error: "Account not active",
      });
    }

    const { sessionKey, expiresAt } = await createSession(
      user.id
    );

    setSessionCookie(reply, sessionKey, expiresAt);

    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    });
  });

  app.post("/logout", async (_request, reply) => {
    clearSessionCookie(reply);

    return reply.send({
      ok: true,
    });
  });

  app.get("/me", async (request, reply) => {
    const user = await getSessionUser(request);

    if (!user) {
      return reply.code(401).send({
        ok: false,
      });
    }

    const wallets = await prisma.walletLink.findMany({
      where: {
        userId: user.id,
        unlinkedAt: null,
      },
      select: {
        chainId: true,
        address: true,
      },
    });

    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerifiedAt: user.emailVerifiedAt,
        status: user.status,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        wallets,
      },
    });
  });
}