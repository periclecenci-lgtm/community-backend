import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";

import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallet.js";
import { commanderRoutes } from "./routes/commander.js";
import { boardsRoutes } from "./routes/boards.js";
import { startCommanderScheduler } from "./workers/commanderScheduler.js";

const PORT = Number(process.env.PORT ?? 4001);
const HOST = process.env.HOST ?? "127.0.0.1";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-secret-change-me-32chars-minimum";

const app = Fastify({ logger: true });

await app.register(cors, { origin: CORS_ORIGIN, credentials: true });
await app.register(cookie, { secret: SESSION_SECRET, hook: "onRequest" });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(walletRoutes, { prefix: "/api/wallet" });
await app.register(commanderRoutes, { prefix: "/api/commander" });
await app.register(boardsRoutes, { prefix: "/api/boards" });

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`Backend community running on http://${HOST}:${PORT}`);
  startCommanderScheduler(app).catch((err) =>
    app.log.error({ err }, "Commander scheduler failed")
  );
});
