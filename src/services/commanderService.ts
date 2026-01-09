import { prisma } from "../shared/prisma.js";
import {
  FX_CHAIN_ID,
  FX_MODEL3_TOKEN_ADDRESS,
  FX_COMMANDER_THRESHOLD,
  FX_MODEL3_TOKEN_DECIMALS,
  readErc20BalanceAtomic,
  readErc20Decimals,
  toAtomicThreshold,
} from "../shared/chain.js";
import type { Address } from "viem";
import { CommanderReason, UserStatus } from "@prisma/client";

function now() {
  return new Date();
}

export async function commanderRecheckForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  if (user.status !== UserStatus.ACTIVE) {
    await upsertStatus(
      userId,
      null,
      false,
      CommanderReason.INACTIVE_ACCOUNT,
      "0"
    );
    return;
  }

  if (!user.emailVerifiedAt) {
    await upsertStatus(
      userId,
      null,
      false,
      CommanderReason.UNVERIFIED_EMAIL,
      "0"
    );
    return;
  }

  const wallet = await prisma.walletLink.findFirst({
    where: { userId, unlinkedAt: null },
    orderBy: { linkedAt: "desc" },
  });

  if (!wallet) {
    await upsertStatus(
      userId,
      null,
      false,
      CommanderReason.NO_WALLET,
      "0"
    );
    return;
  }

  try {
    // decimals: da env se presenti, altrimenti on-chain
    const decimals =
      FX_MODEL3_TOKEN_DECIMALS ??
      (await readErc20Decimals(FX_MODEL3_TOKEN_ADDRESS));

    const thresholdAtomic = toAtomicThreshold(
      FX_COMMANDER_THRESHOLD,
      decimals
    );

    const balanceAtomic = await readErc20BalanceAtomic(
      FX_MODEL3_TOKEN_ADDRESS,
      wallet.address as Address
    );

    const isCommander = balanceAtomic >= thresholdAtomic;

    await upsertStatus(
      userId,
      wallet,
      isCommander,
      isCommander ? CommanderReason.OK : CommanderReason.BELOW_THRESHOLD,
      balanceAtomic.toString()
    );
  } catch (err) {
    await upsertStatus(
      userId,
      wallet,
      false,
      CommanderReason.CHAIN_READ_ERROR,
      "0"
    );
  }
}

async function upsertStatus(
  userId: string,
  wallet: { chainId: number; address: string } | null,
  isCommander: boolean,
  reason: CommanderReason,
  balanceAtomic: string
) {
  const chainId = wallet?.chainId ?? FX_CHAIN_ID;
  const address = wallet?.address ?? "0x0000000000000000000000000000000000000000";

  const existing = await prisma.commanderStatus.findUnique({
    where: {
      userId_chainId_address: { userId, chainId, address },
    },
  });

  await prisma.commanderStatus.upsert({
    where: {
      userId_chainId_address: { userId, chainId, address },
    },
    update: {
      isCommander,
      reason,
      balanceAtomic,
      lastCheckedAt: now(),
      lastEligibleAt: isCommander ? now() : existing?.lastEligibleAt ?? null,
      lastIneligibleAt: !isCommander
        ? now()
        : existing?.lastIneligibleAt ?? null,
    },
    create: {
      userId,
      chainId,
      address,
      isCommander,
      reason,
      balanceAtomic,
      lastCheckedAt: now(),
      lastEligibleAt: isCommander ? now() : null,
      lastIneligibleAt: !isCommander ? now() : null,
    },
  });
}
