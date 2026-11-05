import { arcTestnet, asHex } from "@kitty/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../config";
import { AppError } from "../../lib/errors";

export function createArcClient(rpcUrl = config.ARC_RPC_URL) {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  });
}

export function createArcWallet(privateKey: string, rpcUrl = config.ARC_RPC_URL) {
  return createWalletClient({
    account: privateKeyToAccount(asHex(privateKey)),
    chain: arcTestnet,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 0 }),
  });
}

export async function assertArcChain(client: ReturnType<typeof createArcClient>) {
  if ((await client.getChainId()) !== arcTestnet.id)
    throw new AppError("WRONG_CHAIN", "The configured RPC is not Arc testnet.", 503);
}

export async function arcFees(client: ReturnType<typeof createArcClient>) {
  const suggested = (await client.getGasPrice()) * 2n;
  return {
    maxFeePerGas: suggested > 20_000_000_000n ? suggested : 20_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  };
}
