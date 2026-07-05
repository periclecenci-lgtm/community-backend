import type {
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { nanoid } from "nanoid";

import { prisma } from "./prisma.js";

const COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ??
  "sbelm_comm_sess";

const TTL_SECONDS = Number(
  process.env.SESSION_TTL_SECONDS ?? 1209600
);

export async function createSession(
  userId: string
) {
  const sessionKey = nanoid(48);
  const expiresAt = new Date(
    Date.now() + TTL_SECONDS * 1000
  );

  await prisma.session.create({
    data: {
      userId,
      sessionKey,
      expiresAt,
    },
  });

  return {
    sessionKey,
    expiresAt,
  };
}

export async function revokeSession(
  sessionKey: string
) {
  await prisma.session.updateMany({
    where: {
      sessionKey,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function revokeAllUserSessions(
  userId: string
) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export function setSessionCookie(
  reply: FastifyReply,
  sessionKey: string,
  expiresAt: Date
) {
  reply.setCookie(
    COOKIE_NAME,
    sessionKey,
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production",
      expires: expiresAt,
    }
  );
}

export function clearSessionCookie(
  reply: FastifyReply
) {
  reply.clearCookie(COOKIE_NAME, {
    path: "/",
  });
}

export async function getSessionUser(
  req: FastifyRequest
) {
  const sessionKey =
    req.cookies?.[COOKIE_NAME];

  if (!sessionKey) {
    return null;
  }

  const session =
    await prisma.session.findUnique({
      where: {
        sessionKey,
      },
      include: {
        user: true,
      },
    });

  if (!session) {
    return null;
  }

  if (session.revokedAt) {
    return null;
  }

  if (
    session.expiresAt.getTime() <
    Date.now()
  ) {
    return null;
  }

  if (session.user.status !== "ACTIVE") {
    return null;
  }

  return session.user;
}

export async function requireSessionUser(
  req: FastifyRequest
) {
  const user = await getSessionUser(req);

  if (!user) {
    const error = new Error("UNAUTHORIZED");

    // @ts-expect-error Fastify custom statusCode
    error.statusCode = 401;

    throw error;
  }

  return user;
}

export async function requireAdmin(
  req: FastifyRequest
) {
  const user =
    await requireSessionUser(req);

  if (user.role !== "ADMIN") {
    const error = new Error("FORBIDDEN");

    // @ts-expect-error Fastify custom statusCode
    error.statusCode = 403;

    throw error;
  }

  return user;
}