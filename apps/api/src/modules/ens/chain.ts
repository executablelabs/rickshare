import { asHex } from "@rickshare/shared";
import {
  type Address,
  BaseError,
  CallExecutionError,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AppError } from "../../lib/errors";
import type { EnsChain } from "./service";

/** Turns a contract revert into a typed error; anything else, like a network failure, passes. */
function asRejection(error: unknown): unknown {
  return error instanceof CallExecutionError ||
    (error instanceof BaseError && /revert/i.test(error.message))
    ? new AppError("ENS_CALL_REVERTED", "The ENS call was rejected.", 409)
    : error;
}

/** ENS lives on Ethereum Sepolia, separate from the Arc chain that holds the money. */
export function createSepoliaEnsChain({
  rpcUrl,
  adminKey,
  agentKey,
}: {
  rpcUrl: string;
  adminKey: string;
  agentKey: string;
}): EnsChain {
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 2 });
  const client = createPublicClient({ chain: sepolia, transport });
  const admin = privateKeyToAccount(asHex(adminKey));
  const agent = privateKeyToAccount(asHex(agentKey));
  const wallets = {
    admin: createWalletClient({ account: admin, chain: sepolia, transport }),
    agent: createWalletClient({ account: agent, chain: sepolia, transport }),
  };
  let checkedChain = false;

  async function assertSepolia() {
    if (checkedChain) return;
    if ((await client.getChainId()) !== sepolia.id)
      throw new AppError("WRONG_CHAIN", "SEPOLIA_RPC_URL does not point at Sepolia.", 503);
    checkedChain = true;
  }

  return {
    admin: admin.address,
    agent: agent.address,
    async call(to: Address, data: Hex, from?: Address) {
      await assertSepolia();
      try {
        return (await client.call({ to, data, ...(from ? { account: from } : {}) })).data ?? "0x";
      } catch (error) {
        throw asRejection(error);
      }
    },
    async hasCode(address: Address) {
      await assertSepolia();
      const code = await client.getCode({ address });
      return !!code && code !== "0x";
    },
    async send(signer, to, data) {
      await assertSepolia();
      let hash: Hex;
      try {
        // Gas estimation simulates the call first, so a forbidden write fails here, unsent.
        hash = await wallets[signer].sendTransaction({ to, data });
      } catch (error) {
        throw asRejection(error);
      }
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success")
        throw new AppError("ENS_TRANSACTION_FAILED", "An ENS transaction failed.", 502);
      return hash;
    },
  };
}
