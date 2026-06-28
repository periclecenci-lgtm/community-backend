import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";

import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallet.js";
import { commanderRoutes } from "./routes/commander.js";
import { boardsRoutes } from "./routes/boards.js";
import { adminRoutes } from "./routes/admin.js";
import { startCommanderScheduler } from "./workers/commanderScheduler.js";

const PORT = Number(process.env.PORT ?? 4001);
const HOST = process.env.HOST ?? "127.0.0.1";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-secret-change-me-32chars-minimum";

const app = Fastify({
  logger: true,
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "Validation error",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (error.statusCode === 401) {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }

  if (error.statusCode === 403) {
    return reply.code(403).send({
      error: "Forbidden",
    });
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  app.log.error(error);

  return reply.code(500).send({
    error: "Internal server error",
  });
});

await app.register(cors, {
  origin: CORS_ORIGIN,
  credentials: true,
});

await app.register(cookie, {
  secret: SESSION_SECRET,
  hook: "onRequest",
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
});

app.get("/health", async () => ({
  ok: true,
}));

await app.register(authRoutes, {
  prefix: "/api/auth",
});

await app.register(walletRoutes, {
  prefix: "/api/wallet",
});

await app.register(commanderRoutes, {
  prefix: "/api/commander",
});

await app.register(boardsRoutes, {
  prefix: "/api/boards",
});

await app.register(adminRoutes, {
  prefix: "/api/admin",
});

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`Backend community running on http://${HOST}:${PORT}`);

  startCommanderScheduler(app).catch((error) => {
    app.log.error(
      { error },
      "Commander scheduler failed"
    );
  });
});