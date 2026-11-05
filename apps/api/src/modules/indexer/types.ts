import type { Member, Proposal, TripEvent } from "@kitty/shared";
import type { Address, Hex } from "viem";

export type ChainEvent = {
  vault: Address;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
  name: string;
  proposalId: string | null;
  args: Record<string, unknown> | readonly unknown[];
};
export type CreatedVault = { vault: Address; creator: Address; createdBlock: bigint };
export type VaultSnapshot = {
  address: Address;
  creator: Address;
  endsAt: string;
  members: Member[];
  proposals: Omit<Proposal, "txHash">[];
};
export type TripEventEnvelope = { id: string; tripId: string; data: TripEvent };
export type IndexSource = {
  chainId: number;
  factory: Address;
  head(): Promise<bigint>;
  blockHash(block: bigint): Promise<Hex>;
  created(from: bigint, to: bigint): Promise<CreatedVault[]>;
  events(vaults: Address[], from: bigint, to: bigint): Promise<ChainEvent[]>;
  snapshot(vault: Address, block: bigint, proposalIds: string[]): Promise<VaultSnapshot>;
};
