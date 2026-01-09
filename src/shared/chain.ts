import { createPublicClient, http, getAddress } from "viem";

const ERC20_MIN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v.trim();
}

export const FX_RPC_URL = requireEnv("FX_RPC_URL");
export const FX_CHAIN_ID = Number(requireEnv("FX_CHAIN_ID"));

export const FX_MODEL3_TOKEN_ADDRESS = (() => {
  const raw = requireEnv("FX_MODEL3_TOKEN_ADDRESS");
  return getAddress(raw);
})();

export const FX_COMMANDER_THRESHOLD = (() => {
  const raw = process.env.FX_COMMANDER_THRESHOLD?.trim() ?? "500";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid FX_COMMANDER_THRESHOLD: ${raw}`);
  }
  return n;
})();

export const FX_MODEL3_TOKEN_DECIMALS: number | null = (() => {
  const raw = process.env.FX_MODEL3_TOKEN_DECIMALS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 255) {
    throw new Error(`Invalid FX_MODEL3_TOKEN_DECIMALS: ${raw}`);
  }
  return n;
})();

export const publicClient = createPublicClient({
  chain: {
    id: FX_CHAIN_ID,
    name: "FX_CHAIN",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [FX_RPC_URL] } },
  },
  transport: http(FX_RPC_URL),
});

export async function readErc20Decimals(
  tokenAddress: `0x${string}`
): Promise<number> {
  const d = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_MIN_ABI,
    functionName: "decimals",
  });
  return Number(d);
}

export async function readErc20BalanceAtomic(
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`
): Promise<bigint> {
  return await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: [ownerAddress],
  });
}

export function toAtomicThreshold(
  amountTokens: number,
  decimals: number
): bigint {
  if (!Number.isInteger(amountTokens)) {
    throw new Error("Threshold must be an integer token amount for MVP");
  }
  const zeros = "0".repeat(decimals);
  return BigInt(`${amountTokens}${zeros}`);
}
