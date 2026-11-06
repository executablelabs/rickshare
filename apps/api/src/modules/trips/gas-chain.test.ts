import { expect, test } from "bun:test";
import { arcTestnet } from "@rickshare/shared";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseTransaction,
  parseUnits,
  recoverTransactionAddress,
  type TransactionSerialized,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { createGasSponsorChain } from "./gas-chain";

const key = `0x${"01".repeat(32)}` as const;
const account = privateKeyToAccount(key);
const recipient = "0x0000000000000000000000000000000000001234";
const RpcRequest = z.object({
  id: z.number(),
  method: z.string(),
  params: z.array(z.unknown()).optional(),
});

function fixture(options: { balance?: bigint; chainId?: number; existing?: boolean } = {}) {
  const calls: z.infer<typeof RpcRequest>[] = [];
  const transport = http("https://arc.invalid", {
    retryCount: 0,
    fetchFn: async (_input, init) => {
      const request = RpcRequest.parse(JSON.parse(String(init?.body)));
      calls.push(request);
      const results: Record<string, unknown> = {
        eth_chainId: `0x${(options.chainId ?? arcTestnet.id).toString(16)}`,
        eth_gasPrice: "0x4a817c800",
        eth_estimateGas: "0x5209",
        eth_getBalance: `0x${(options.balance ?? parseUnits("10", 18)).toString(16)}`,
        eth_getTransactionCount: "0x7",
        eth_getTransactionByHash: options.existing ? { hash: `0x${"ab".repeat(32)}` } : null,
        eth_sendRawTransaction: `0x${"ab".repeat(32)}`,
      };
      if (!(request.method in results)) throw new Error(`Unexpected RPC: ${request.method}`);
      return Response.json({ jsonrpc: "2.0", id: request.id, result: results[request.method] });
    },
  });
  const client = createPublicClient({ chain: arcTestnet, transport });
  const wallet = createWalletClient({ account, chain: arcTestnet, transport });
  return { chain: createGasSponsorChain(key, client, wallet), calls };
}

test("a zero-balance user's gas is simulated with a funded override and rounded up by 25%", async () => {
  const f = fixture();
  const allowance = await f.chain.quote({
    chainId: arcTestnet.id,
    from: recipient,
    to: account.address,
    data: "0x1234",
    value: "0x0",
    maxFeePerGas: "0x9502f9000",
    maxPriorityFeePerGas: "0x3b9aca00",
  });
  expect(allowance).toBe(26252n * 40_000_000_000n);
  const estimate = f.calls.find((call) => call.method === "eth_estimateGas");
  expect(estimate?.params?.[2]).toEqual({
    [recipient]: { balance: `0x${parseUnits("1000000", 18).toString(16)}` },
  });
  expect(f.calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
});

test("the dedicated sponsor signs a native 18-decimal USDC allowance on Arc testnet", async () => {
  const f = fixture();
  const amount = parseUnits("0.2", 18);
  const signed = await f.chain.sign(recipient, amount);
  const transaction = parseTransaction(signed);
  expect(transaction.to?.toLowerCase()).toBe(recipient);
  expect(transaction.value).toBe(amount);
  expect(transaction.chainId).toBe(arcTestnet.id);
  expect(transaction.nonce).toBe(7);
  expect(
    await recoverTransactionAddress({ serializedTransaction: signed as TransactionSerialized }),
  ).toBe(account.address);
  expect(f.calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
});

test("an empty sponsor or wrong chain cannot sign a funding transfer", async () => {
  await expect(fixture({ balance: 0n }).chain.sign(recipient, 1n)).rejects.toMatchObject({
    code: "GAS_SPONSOR_EMPTY",
  });
  await expect(fixture({ chainId: 1 }).chain.sign(recipient, 1n)).rejects.toMatchObject({
    code: "WRONG_CHAIN",
  });
});

test("retrying a transfer already known to the chain does not broadcast it again", async () => {
  const f = fixture({ existing: true });
  await f.chain.broadcast("0x1234", `0x${"ab".repeat(32)}`);
  expect(f.calls.some((call) => call.method === "eth_sendRawTransaction")).toBe(false);
});
