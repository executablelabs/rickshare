import { ARC_USDC } from "@rickshare/shared";
import { erc20Abi, tripVaultAbi } from "@rickshare/shared/abi";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { type Address, encodeFunctionData, type Hex } from "viem";
import type { AppDatabase } from "../../db/client";
import { chainCursors, chainEvents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { createArcClient } from "../chain/clients";
import { prepareWalletTransaction } from "../chain/transactions";
import type { IndexerService } from "../indexer/service";
import type { TripChain } from "./chain";
import type { MoneyAction } from "./money-schemas";

export class MoneyService {
  constructor(
    private readonly db: AppDatabase,
    private readonly chain: TripChain,
    private readonly indexer: IndexerService,
    private readonly client = createArcClient(),
  ) {}

  private async member(actor: Address, vault: Address) {
    const info = await this.chain.info(vault, actor);
    if (!info.isMember)
      throw new AppError("NOT_MEMBER", "Join this trip before accessing its money.", 403);
    return info;
  }

  async balances(actor: Address, vault: Address) {
    await this.member(actor, vault);
    await this.indexer.sync();
    const trip = this.indexer.requireMember(vault, actor);
    const cursor = this.db
      .select()
      .from(chainCursors)
      .where(eq(chainCursors.id, this.indexer.cursorId))
      .get();
    if (!cursor)
      throw new AppError("INDEX_NOT_READY", "The trip balance is still being indexed.", 503);
    const blockNumber = BigInt(cursor.blockNumber);
    const [balance, walletBalance, settled] = await Promise.all([
      this.client.readContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "getBalance",
        args: [actor],
        blockNumber,
      }),
      this.client.readContract({
        address: ARC_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [actor],
        blockNumber,
      }),
      this.client.readContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "settled",
        blockNumber,
      }),
    ]);
    return {
      members: trip.members,
      own: {
        deposited: balance.deposited.toString(),
        spent: balance.spent.toString(),
        locked: balance.locked.toString(),
        available: balance.available.toString(),
        withdrawn: balance.withdrawn.toString(),
      },
      walletBalance: walletBalance.toString(),
      settled,
      indexedBlock: cursor.blockNumber,
    };
  }

  async history(actor: Address, vault: Address, limit: number, before?: string) {
    await this.member(actor, vault);
    await this.indexer.sync();
    const [block, index] = before?.split(":") ?? [];
    const height = sql`CAST(${chainEvents.blockNumber} AS INTEGER)`;
    const previous =
      block !== undefined && index !== undefined
        ? or(
            lt(height, BigInt(block)),
            and(eq(height, BigInt(block)), lt(chainEvents.logIndex, Number(index))),
          )
        : undefined;
    const rows = this.db
      .select()
      .from(chainEvents)
      .where(and(eq(chainEvents.vault, vault.toLowerCase()), previous))
      .orderBy(desc(height), desc(chainEvents.logIndex))
      .limit(limit + 1)
      .all();
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      events: visible.map((row) => ({
        id: row.id,
        name: row.name,
        blockNumber: row.blockNumber,
        transactionHash: row.transactionHash,
        logIndex: row.logIndex,
        proposalId: row.proposalId,
        data: JSON.parse(row.payload) as unknown,
      })),
      nextCursor: rows.length > limit && last ? `${last.blockNumber}:${last.logIndex}` : null,
    };
  }

  async prepare(actor: Address, vault: Address, input: MoneyAction) {
    const info = await this.member(actor, vault);
    const block = await this.client.getBlock();
    const base = { address: vault, abi: tripVaultAbi } as const;
    const transactions: Awaited<ReturnType<typeof prepareWalletTransaction>>[] = [];
    const add = async (to: Address, data: Hex) =>
      transactions.push(await prepareWalletTransaction(this.client, actor, to, data));
    try {
      if (input.action === "deposit") {
        if (block.timestamp >= info.endsAt)
          throw new AppError("TRIP_ENDED", "This trip has ended.", 409);
        const amount = BigInt(input.amount);
        const [balance, allowance] = await Promise.all([
          this.client.readContract({
            address: ARC_USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [actor],
          }),
          this.client.readContract({
            address: ARC_USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [actor, vault],
          }),
        ]);
        if (balance < amount)
          throw new AppError(
            "INSUFFICIENT_WALLET_BALANCE",
            "Add USDC to this wallet before depositing.",
            409,
          );
        if (allowance < amount)
          await add(
            ARC_USDC,
            encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }),
          );
        else
          await this.client.simulateContract({
            ...base,
            account: actor,
            functionName: "deposit",
            args: [amount],
          });
        await add(
          vault,
          encodeFunctionData({ abi: tripVaultAbi, functionName: "deposit", args: [amount] }),
        );
      } else if (input.action === "withdraw") {
        const args = [BigInt(input.amount)] as const;
        const balance = await this.client.readContract({
          ...base,
          functionName: "getBalance",
          args: [actor],
        });
        if (balance.available < args[0])
          throw new AppError(
            "INSUFFICIENT_AVAILABLE_BALANCE",
            "Only your unlocked money can be withdrawn.",
            409,
          );
        await this.client.simulateContract({
          ...base,
          account: actor,
          functionName: "withdraw",
          args,
        });
        await add(vault, encodeFunctionData({ abi: tripVaultAbi, functionName: "withdraw", args }));
      } else if (input.action === "policy") {
        if (BigInt(input.autoApproveMax) > BigInt(input.totalCap))
          throw new AppError(
            "INVALID_POLICY",
            "The per-purchase limit cannot exceed the automatic trip cap.",
            400,
          );
        const args = [BigInt(input.autoApproveMax), BigInt(input.totalCap)] as const;
        await this.client.simulateContract({
          ...base,
          account: actor,
          functionName: "setPolicy",
          args,
        });
        await add(
          vault,
          encodeFunctionData({ abi: tripVaultAbi, functionName: "setPolicy", args }),
        );
      } else if (input.action === "reject" || input.action === "refund") {
        const args = [BigInt(input.proposalId)] as const;
        await this.client.simulateContract({
          ...base,
          account: actor,
          functionName: input.action,
          args,
        });
        await add(
          vault,
          encodeFunctionData({ abi: tripVaultAbi, functionName: input.action, args }),
        );
      } else {
        await this.client.simulateContract({ ...base, account: actor, functionName: "settle" });
        await add(vault, encodeFunctionData({ abi: tripVaultAbi, functionName: "settle" }));
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "TRANSACTION_NOT_READY",
        "This action is not currently available. Refresh the trip and try again.",
        409,
      );
    }
    return { action: input.action, transactions };
  }
}
