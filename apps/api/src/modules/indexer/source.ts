import { arcTestnet, Member, Proposal } from "@rickshare/shared";
import { tripFactoryAbi, tripVaultAbi } from "@rickshare/shared/abi";
import { type Address, getAddress, parseEventLogs } from "viem";
import { AppError } from "../../lib/errors";
import { assertArcChain, createArcClient } from "../chain/clients";
import type { ChainEvent, IndexSource } from "./types";

const statuses = ["pending", "locked", "fulfilled", "refunded", "rejected"] as const;
const states = ["waiting", "auto", "approved", "rejected"] as const;

export function createIndexSource(
  factory: Address,
  client = createArcClient(),
  isWorldLinked: (address: Address) => boolean = () => false,
): IndexSource {
  return {
    chainId: arcTestnet.id,
    factory,
    async head() {
      await assertArcChain(client);
      return client.getBlockNumber({ cacheTime: 0 });
    },
    async blockHash(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash)
        throw new AppError("BLOCK_UNAVAILABLE", "The requested block is not finalized.", 503);
      return block.hash;
    },
    async created(fromBlock, toBlock) {
      const logs = await client.getContractEvents({
        address: factory,
        abi: tripFactoryAbi,
        eventName: "TripCreated",
        fromBlock,
        toBlock,
        strict: true,
      });
      return logs.map((log) => ({
        vault: getAddress(log.args.vault),
        creator: getAddress(log.args.creator),
        createdBlock: log.blockNumber,
      }));
    },
    async events(vaults, fromBlock, toBlock) {
      if (vaults.length === 0) return [];
      // Arc's public RPC rejects ABI-wide OR topics even for a single block.
      // Fetch by vault and retain strictly decoded events locally instead.
      const groups = await Promise.all(
        vaults.map(async (address) =>
          parseEventLogs({
            abi: tripVaultAbi,
            logs: await client.getLogs({ address, fromBlock, toBlock }),
            strict: true,
          }),
        ),
      );
      return groups
        .flat()
        .map(
          (log): ChainEvent => ({
            vault: getAddress(log.address),
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            name: log.eventName,
            proposalId: "proposalId" in log.args ? log.args.proposalId.toString() : null,
            args: log.args,
          }),
        )
        .sort((left, right) =>
          left.blockNumber < right.blockNumber
            ? -1
            : left.blockNumber > right.blockNumber
              ? 1
              : left.logIndex - right.logIndex,
        );
    },
    async snapshot(address, blockNumber, proposalIds) {
      const base = { address, abi: tripVaultAbi, blockNumber } as const;
      const [creator, endsAt, members] = await Promise.all([
        client.readContract({ ...base, functionName: "creator" }),
        client.readContract({ ...base, functionName: "endsAt" }),
        client.readContract({ ...base, functionName: "members" }),
      ]);
      const balances = await Promise.all(
        members.map(async (member) => {
          const [balance, policy] = await Promise.all([
            client.readContract({ ...base, functionName: "getBalance", args: [member] }),
            client.readContract({ ...base, functionName: "policies", args: [member] }),
          ]);
          return Member.parse({
            address: getAddress(member),
            displayName: `${member.slice(0, 6)}…${member.slice(-4)}`,
            ensName: null,
            worldLinked: isWorldLinked(member),
            policy: { autoApproveMax: policy[0].toString(), totalCap: policy[1].toString() },
            deposited: balance.deposited.toString(),
            spent: balance.spent.toString(),
            locked: balance.locked.toString(),
            available: balance.available.toString(),
          });
        }),
      );
      const proposals = await Promise.all(
        proposalIds.map(async (id) => {
          const [proposal, shares] = await Promise.all([
            client.readContract({ ...base, functionName: "getProposal", args: [BigInt(id)] }),
            client.readContract({ ...base, functionName: "getShares", args: [BigInt(id)] }),
          ]);
          return Proposal.omit({ txHash: true }).parse({
            id,
            tripId: address.toLowerCase(),
            merchant: getAddress(proposal.merchant),
            merchantName: proposal.merchant,
            title: proposal.title,
            location: proposal.location,
            startsAt: new Date(Number(proposal.startsAt) * 1000).toISOString(),
            total: proposal.total.toString(),
            shares: shares[0].map((member, index) => ({
              member: getAddress(member),
              amount: shares[1][index]?.toString(),
              state: states[shares[2][index] ?? -1],
            })),
            status: statuses[proposal.status],
            deadline: new Date(Number(proposal.deadline) * 1000).toISOString(),
            quoteExpiresAt: new Date(Number(proposal.quoteExpiresAt) * 1000).toISOString(),
            ticketHash: /^0x0+$/.test(proposal.ticketHash) ? null : proposal.ticketHash,
          });
        }),
      );
      return {
        address,
        creator: getAddress(creator),
        endsAt: new Date(Number(endsAt) * 1000).toISOString(),
        members: balances,
        proposals,
      };
    },
  };
}
