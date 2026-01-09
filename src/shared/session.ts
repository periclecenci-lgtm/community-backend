import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";
import { nanoid } from "nanoid";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sbelm_comm_sess";
const TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 1209600);

export async function createSession(userId: string) {
  const sessionKey = nanoid(48);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await prisma.session.create({
    data: { userId, sessionKey, expiresAt }
  });

  return { sessionKey, expiresAt };
}

export async function revokeSession(sessionKey: string) {
  await prisma.session.updateMany({
    where: { sessionKey, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export function setSessionCookie(reply: FastifyReply, sessionKey: string, expiresAt: Date) {
  reply.setCookie(COOKIE_NAME, sessionKey, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function getSessionUser(req: FastifyRequest) {
  const sessionKey = req.cookies?.[COOKIE_NAME];
  if (!sessionKey) return null;

  const session = await prisma.session.findUnique({
    where: { sessionKey },
    include: { user: true }
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  return session.user;
}

export async function requireSessionUser(req: FastifyRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    // @ts-expect-error fastify custom
    err.statusCode = 401;
    throw err;
  }
  return user;
}
