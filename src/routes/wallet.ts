import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { verifyMessage, type Address } from "viem";
import type { Prisma } from "@prisma/client";

import { prisma } from "../shared/prisma.js";
import { requireSessionUser } from "../shared/session.js";

const FX_CHAIN_ID = Number(process.env.FX_CHAIN_ID ?? 11155111);

function normAddress(a: string) {
  return a.toLowerCase();
}

export async function walletRoutes(app: FastifyInstance) {
  /**
   * POST /api/wallet/nonce
   * Genera un nonce monouso per il wallet linking
   */
  app.post("/nonce", async (req, reply) => {
    const user = await requireSessionUser(req);

    // invalida eventuali nonce precedenti
    await prisma.walletNonce.deleteMany({
      where: { userId: user.id },
    });

    const nonce = nanoid(32);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.walletNonce.create({
      data: {
        userId: user.id,
        nonce,
        expiresAt,
      },
    });

    return reply.send({ ok: true, nonce });
  });

  /**
   * POST /api/wallet/link
   * Collega un wallet all'account community
   */
  app.post("/link", async (req, reply) => {
    const user = await requireSessionUser(req);

    const Body = z.object({
      address: z.string().length(42),
      chainId: z.number().int(),
      signature: z.string().min(10),
      nonce: z.string().min(10),
    });

    const body = Body.parse(req.body);

    if (body.chainId !== FX_CHAIN_ID) {
      return reply.code(400).send({
        ok: false,
        code: "UNSUPPORTED_CHAIN",
      });
    }

    const nonceRecord = await prisma.walletNonce.findUnique({
      where: { nonce: body.nonce },
    });

    if (!nonceRecord || nonceRecord.userId !== user.id) {
      return reply.code(400).send({
        ok: false,
        code: "INVALID_NONCE",
      });
    }

    if (nonceRecord.usedAt) {
      return reply.code(400).send({
        ok: false,
        code: "NONCE_USED",
      });
    }

    if (nonceRecord.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({
        ok: false,
        code: "NONCE_EXPIRED",
      });
    }

    const address = body.address as Address;

    // ⚠️ Messaggio deterministico: DEVE combaciare col frontend
    const message =
      `SBELM Community Wallet Link\n` +
      `UserId: ${user.id}\n` +
      `ChainId: ${body.chainId}\n` +
      `Nonce: ${body.nonce}`;

    const verified = await verifyMessage({
      address,
      message,
      signature: body.signature as `0x${string}`,
    });

    if (!verified) {
      return reply.code(400).send({
        ok: false,
        code: "INVALID_SIGNATURE",
      });
    }

    const addr = normAddress(body.address);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.walletNonce.update({
        where: { id: nonceRecord.id },
        data: { usedAt: new Date() },
      });

      await tx.walletLink.upsert({
        where: {
          chainId_address: {
            chainId: body.chainId,
            address: addr,
          },
        },
        update: {
          userId: user.id,
          linkedAt: new Date(),
          unlinkedAt: null,
        },
        create: {
          userId: user.id,
          chainId: body.chainId,
          address: addr,
        },
      });
    });

    return reply.send({
      ok: true,
      linked: {
        chainId: body.chainId,
        address: addr,
      },
    });
  });
}
