import { ARC_USDC, arcTestnet, inviteTypedData, type WalletTransaction } from "@rickshare/shared";
import { tripFactoryAbi, tripVaultAbi } from "@rickshare/shared/abi";
import { type Address, encodeFunctionData, getAddress, type Hex, parseEventLogs } from "viem";
import { AppError } from "../../lib/errors";
import { assertArcChain, createArcClient } from "../chain/clients";
import { prepareWalletTransaction } from "../chain/transactions";

export type TripChain = {
  info(
    vault: Address,
    member: Address,
  ): Promise<{ creator: Address; endsAt: bigint; isMember: boolean; memberCount: number }>;
  prepareCreate(creator: Address, endsAt: bigint): Promise<WalletTransaction>;
  confirmCreate(hash: Hex, creator: Address, endsAt: bigint): Promise<Address>;
  verifyInvite(vault: Address, member: Address, deadline: bigint, signature: Hex): Promise<boolean>;
  prepareJoin(
    vault: Address,
    member: Address,
    deadline: bigint,
    signature: Hex,
  ): Promise<WalletTransaction>;
  confirmJoin(vault: Address, member: Address, hash: Hex): Promise<void>;
};

export function createTripChain(factory: Address, client = createArcClient()): TripChain {
  const transaction = async (from: Address, to: Address, data: Hex): Promise<WalletTransaction> => {
    return prepareWalletTransaction(client, from, to, data);
  };
  const registered = async (vault: Address) => {
    await assertArcChain(client);
    if (
      !(await client.readContract({
        address: factory,
        abi: tripFactoryAbi,
        functionName: "isVault",
        args: [vault],
      }))
    )
      throw new AppError(
        "INVALID_VAULT",
        "This trip was not created by the configured factory.",
        404,
      );
  };
  return {
    async info(vault, member) {
      await registered(vault);
      const base = { address: vault, abi: tripVaultAbi } as const;
      const [creator, endsAt, isMember, members] = await Promise.all([
        client.readContract({ ...base, functionName: "creator" }),
        client.readContract({ ...base, functionName: "endsAt" }),
        client.readContract({ ...base, functionName: "isMember", args: [member] }),
        client.readContract({ ...base, functionName: "members" }),
      ]);
      return { creator: getAddress(creator), endsAt, isMember, memberCount: members.length };
    },
    async prepareCreate(creator, endsAt) {
      await assertArcChain(client);
      const token = await client.readContract({
        address: factory,
        abi: tripFactoryAbi,
        functionName: "token",
      });
      if (token.toLowerCase() !== ARC_USDC.toLowerCase())
        throw new AppError("INVALID_FACTORY", "This factory does not use Arc USDC.", 503);
      return transaction(
        creator,
        factory,
        encodeFunctionData({
          abi: tripFactoryAbi,
          functionName: "createTrip",
          args: [[creator], endsAt],
        }),
      );
    },
    async confirmCreate(hash, creator, endsAt) {
      await assertArcChain(client);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success")
        throw new AppError(
          "TRIP_CREATION_REVERTED",
          "The trip creation transaction did not complete.",
          409,
        );
      const event = parseEventLogs({
        abi: tripFactoryAbi,
        eventName: "TripCreated",
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === factory.toLowerCase()),
        strict: true,
      }).find(
        (log) =>
          log.args.creator.toLowerCase() === creator.toLowerCase() && log.args.endsAt === endsAt,
      );
      if (!event)
        throw new AppError(
          "TRIP_RECEIPT_MISMATCH",
          "The receipt does not match your trip creation request.",
          400,
        );
      return getAddress(event.args.vault);
    },
    async verifyInvite(vault, member, deadline, signature) {
      await registered(vault);
      const creator = await client.readContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "creator",
      });
      return client.verifyTypedData({
        address: creator,
        ...inviteTypedData({ chainId: arcTestnet.id, vaultAddress: vault, member, deadline }),
        signature,
      });
    },
    async prepareJoin(vault, member, deadline, signature) {
      await registered(vault);
      await client.simulateContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "join",
        args: [deadline, signature],
        account: member,
      });
      return transaction(
        member,
        vault,
        encodeFunctionData({
          abi: tripVaultAbi,
          functionName: "join",
          args: [deadline, signature],
        }),
      );
    },
    async confirmJoin(vault, member, hash) {
      await registered(vault);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      const event = parseEventLogs({
        abi: tripVaultAbi,
        eventName: "MemberJoined",
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === vault.toLowerCase()),
        strict: true,
      }).find((log) => log.args.member.toLowerCase() === member.toLowerCase());
      if (receipt.status !== "success" || !event)
        throw new AppError(
          "JOIN_RECEIPT_MISMATCH",
          "The receipt does not confirm your trip membership.",
          400,
        );
    },
  };
}
