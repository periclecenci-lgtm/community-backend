import type { FastifyInstance } from "fastify";
import { prisma } from "../shared/prisma.js";
import { commanderRecheckForUser } from "../services/commanderService.js";
import { UserStatus } from "@prisma/client";

const INTERVAL_SECONDS = Number(
  process.env.FX_COMMANDER_CHECK_INTERVAL_SECONDS ?? 1800
);

export async function startCommanderScheduler(
  app: FastifyInstance
): Promise<void> {
  const intervalMs = INTERVAL_SECONDS * 1000;

  const tick = async () => {
    try {
      const users = await prisma.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          emailVerifiedAt: { not: null },
        },
        select: { id: true },
      });

      for (const u of users) {
        await commanderRecheckForUser(u.id);
      }
    } catch (err) {
      app.log.error({ err }, "Commander scheduler tick failed");
    }
  };

  // first run immediately
  void tick();

  // periodic runs
  setInterval(() => {
    void tick();
  }, intervalMs);
}
