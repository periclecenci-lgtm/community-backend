import type { FastifyInstance } from "fastify";
import { requireSessionUser } from "../shared/session.js";
import { prisma } from "../shared/prisma.js";
import { commanderRecheckForUser } from "../services/commanderService.js";
import { FX_COMMANDER_THRESHOLD } from "../shared/chain.js";

export async function commanderRoutes(app: FastifyInstance) {
  app.get("/status", async (req) => {
    const user = await requireSessionUser(req);

    const status = await prisma.commanderStatus.findFirst({
      where: { userId: user.id },
      orderBy: { lastCheckedAt: "desc" },
    });

    if (!status) {
      return {
        ok: true,
        status: {
          isCommander: false,
          reason: "NO_WALLET",
          balanceAtomic: "0",
          requiredThreshold: String(FX_COMMANDER_THRESHOLD),
          lastCheckedAt: null,
        },
      };
    }

    return {
      ok: true,
      status: {
        isCommander: status.isCommander,
        reason: status.reason,
        balanceAtomic: status.balanceAtomic,
        requiredThreshold: String(FX_COMMANDER_THRESHOLD),
        lastCheckedAt: status.lastCheckedAt,
        lastEligibleAt: status.lastEligibleAt,
        lastIneligibleAt: status.lastIneligibleAt,
        chainId: status.chainId,
        address: status.address,
      },
    };
  });

  app.post("/refresh", async (req) => {
    const user = await requireSessionUser(req);
    await commanderRecheckForUser(user.id);
    return { ok: true };
  });
}
