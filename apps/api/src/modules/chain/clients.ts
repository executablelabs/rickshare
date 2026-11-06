import { arcTestnet, asHex } from "@rickshare/shared";
import { createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../config";
import { AppError } from "../../lib/errors";
import { createPacedArcTransport } from "./rpc";

export function createArcClient(rpcUrl = config.ARC_RPC_URL) {
  return createPublicClient({
    chain: arcTestnet,
    transport: createPacedArcTransport(rpcUrl),
  });
}

export function createArcWallet(privateKey: string, rpcUrl = config.ARC_RPC_URL) {
  return createWalletClient({
    account: privateKeyToAccount(asHex(privateKey)),
    chain: arcTestnet,
    transport: createPacedArcTransport(rpcUrl),
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
