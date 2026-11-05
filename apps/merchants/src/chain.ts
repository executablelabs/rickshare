import { arcTestnet } from "@kitty/shared";
import { tripFactoryAbi, tripVaultAbi } from "@kitty/shared/abi";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  getAddress,
  type Hex,
  http,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { MerchantError } from "./errors";

export type MerchantPurchase = {
  merchant: Address;
  total: bigint;
  quoteHash: Hex;
  ticketHash: Hex;
  deadline: bigint;
  status: number;
  participants: Address[];
};
export type MerchantChain = {
  scope: string;
  chainId: number;
  validate(vault: Address, merchant: Address): Promise<{ endsAt: bigint }>;
  head(): Promise<bigint>;
  blockHash(block: bigint): Promise<Hex>;
  created(from: bigint, to: bigint): Promise<Address[]>;
  locked(
    vaults: Address[],
    from: bigint,
    to: bigint,
  ): Promise<{ vault: Address; proposalId: string }[]>;
  purchase(vault: Address, id: bigint): Promise<MerchantPurchase>;
  fulfill(vault: Address, id: bigint, hash: Hex, account: PrivateKeyAccount): Promise<void>;
};

export function createMerchantChain(factory: Address, rpcUrl: string | undefined): MerchantChain {
  const transport = http(rpcUrl, { timeout: 15_000, retryCount: 2 });
  const client = createPublicClient({ chain: arcTestnet, transport });
  const assertChain = async () => {
    if ((await client.getChainId()) !== arcTestnet.id)
      throw new MerchantError("WRONG_CHAIN", "The merchant RPC is not Arc testnet.", 503);
  };
  return {
    chainId: arcTestnet.id,
    scope: `${arcTestnet.id}:${factory.toLowerCase()}`,
    async validate(vault, merchant) {
      await assertChain();
      if (
        !(await client.readContract({
          address: factory,
          abi: tripFactoryAbi,
          functionName: "isVault",
          args: [vault],
        }))
      )
        throw new MerchantError("INVALID_VAULT", "This trip vault is not registered.", 404);
      const [allowed, endsAt] = await Promise.all([
        client.readContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "allowedMerchants",
          args: [merchant],
        }),
        client.readContract({ address: vault, abi: tripVaultAbi, functionName: "endsAt" }),
      ]);
      if (!allowed)
        throw new MerchantError(
          "MERCHANT_NOT_ALLOWED",
          "This merchant is not enabled for the trip.",
          403,
        );
      return { endsAt };
    },
    async head() {
      await assertChain();
      return client.getBlockNumber({ cacheTime: 0 });
    },
    async blockHash(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash)
        throw new MerchantError("BLOCK_UNAVAILABLE", "The block is unavailable.", 503);
      return block.hash;
    },
    async created(fromBlock, toBlock) {
      return (
        await client.getContractEvents({
          address: factory,
          abi: tripFactoryAbi,
          eventName: "TripCreated",
          fromBlock,
          toBlock,
          strict: true,
        })
      ).map((log) => getAddress(log.args.vault));
    },
    async locked(vaults, fromBlock, toBlock) {
      const logs = await Promise.all(
        vaults.map((address) =>
          client.getContractEvents({
            address,
            abi: tripVaultAbi,
            eventName: "Locked",
            fromBlock,
            toBlock,
            strict: true,
          }),
        ),
      );
      return logs.flat().map((log) => ({
        vault: getAddress(log.address),
        proposalId: log.args.proposalId.toString(),
      }));
    },
    async purchase(vault, id) {
      const [proposal, shares] = await Promise.all([
        client.readContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "getProposal",
          args: [id],
        }),
        client.readContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "getShares",
          args: [id],
        }),
      ]);
      return {
        merchant: getAddress(proposal.merchant),
        total: proposal.total,
        quoteHash: proposal.quoteHash,
        ticketHash: proposal.ticketHash,
        deadline: proposal.deadline,
        status: proposal.status,
        participants: shares[0].map((member) => getAddress(member)),
      };
    },
    async fulfill(vault, id, ticketHash, account) {
      await assertChain();
      const wallet = createWalletClient({ account, chain: arcTestnet, transport });
      const suggested = (await client.getGasPrice()) * 2n;
      const hash = await wallet.writeContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "fulfill",
        args: [id, ticketHash],
        maxFeePerGas: suggested > 20_000_000_000n ? suggested : 20_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new MerchantError("DELIVERY_REVERTED", "Ticket delivery did not complete.", 503);
    },
  };
}
