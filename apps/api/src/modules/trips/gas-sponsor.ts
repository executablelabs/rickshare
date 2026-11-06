import { asHex, WalletTransaction } from "@rickshare/shared";
import { and, eq, isNull } from "drizzle-orm";
import { getAddress, keccak256 } from "viem";
import type { AppDatabase } from "../../db/client";
import { tripGasSponsorships } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { GasSponsorChain } from "./gas-chain";

export class TripGasSponsor {
  constructor(
    private readonly db: AppDatabase,
    private readonly chain: GasSponsorChain,
    private readonly limits: { maxFee: bigint; dailyBudget: bigint; now?: () => number },
  ) {}

  async cover(creationId: string, transaction: WalletTransaction) {
    try {
      return await this.fund(creationId, transaction);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("GAS_SPONSOR_UNAVAILABLE");
      throw new AppError(
        "GAS_SPONSOR_UNAVAILABLE",
        "Rickshare could not cover the setup fee yet. Please try again.",
        503,
      );
    }
  }

  private async fund(
    creationId: string,
    transaction: WalletTransaction,
  ): Promise<WalletTransaction> {
    const lookup = () =>
      this.db
        .select()
        .from(tripGasSponsorships)
        .where(eq(tripGasSponsorships.creationId, creationId))
        .get();
    let row = lookup();
    if (!row) {
      const outstanding = this.db
        .select()
        .from(tripGasSponsorships)
        .where(and(eq(tripGasSponsorships.confirmed, false), isNull(tripGasSponsorships.errorCode)))
        .get();
      if (outstanding) {
        try {
          await this.fund(outstanding.creationId, { ...transaction, from: outstanding.recipient });
        } catch (error) {
          // A mined revert consumes its nonce, so subsequent creations may proceed.
          if (!(error instanceof AppError) || error.code !== "GAS_SPONSOR_REVERTED") throw error;
          logger.error("GAS_SPONSOR_REVERTED");
        }
      }
      const amount = await this.chain.quote(transaction);
      if (amount <= 0n || amount > this.limits.maxFee)
        throw new AppError(
          "GAS_SPONSOR_FEE_LIMIT",
          "The setup fee is unusually high. Please try again later.",
          503,
        );
      const day = new Date(this.limits.now?.() ?? Date.now()).toISOString().slice(0, 10);
      this.db.transaction(() => {
        if (lookup()) return;
        // Only one outstanding transfer may allocate the sponsor's next nonce.
        if (
          this.db
            .select()
            .from(tripGasSponsorships)
            .where(
              and(eq(tripGasSponsorships.confirmed, false), isNull(tripGasSponsorships.errorCode)),
            )
            .get()
        )
          throw new AppError(
            "GAS_SPONSOR_BUSY",
            "Another setup fee is being covered. Please try again shortly.",
            503,
          );
        const today = this.db
          .select()
          .from(tripGasSponsorships)
          .where(eq(tripGasSponsorships.day, day))
          .all();
        if (today.filter((item) => item.recipient === transaction.from.toLowerCase()).length >= 5)
          throw new AppError(
            "GAS_SPONSOR_WALLET_LIMIT",
            "Your daily trip-creation allowance is used. Please try again tomorrow.",
            429,
          );
        if (
          today.reduce((sum, item) => sum + BigInt(item.amount), amount) > this.limits.dailyBudget
        )
          throw new AppError(
            "GAS_SPONSOR_DAILY_LIMIT",
            "Rickshare's daily setup-fee allowance is used. Please try again tomorrow.",
            503,
          );
        this.db
          .insert(tripGasSponsorships)
          .values({
            creationId,
            recipient: transaction.from.toLowerCase(),
            day,
            amount: amount.toString(),
            walletTransaction: JSON.stringify(transaction),
          })
          .run();
      });
      row = lookup();
    }
    if (!row || row.recipient !== transaction.from.toLowerCase())
      throw new AppError("GAS_SPONSOR_MISMATCH", "This setup fee belongs to another request.", 409);
    if (row.errorCode)
      throw new AppError(
        row.errorCode,
        "The setup fee could not be covered. Please contact Rickshare.",
        503,
      );
    if (row.confirmed) return WalletTransaction.parse(JSON.parse(row.walletTransaction));
    if (!row.signedTransaction) {
      const signedTransaction = await this.chain.sign(
        getAddress(transaction.from),
        BigInt(row.amount),
      );
      // Save before broadcasting: retries and restarts reuse the same signed transfer.
      this.db
        .update(tripGasSponsorships)
        .set({ signedTransaction, transactionHash: keccak256(signedTransaction) })
        .where(
          and(
            eq(tripGasSponsorships.creationId, creationId),
            isNull(tripGasSponsorships.signedTransaction),
          ),
        )
        .run();
      row = lookup();
    }
    if (!row?.signedTransaction || !row.transactionHash)
      throw new AppError(
        "GAS_SPONSOR_PENDING",
        "The setup fee is still being prepared. Please try again.",
        503,
      );
    await this.chain.broadcast(asHex(row.signedTransaction), asHex(row.transactionHash));
    try {
      await this.chain.confirm(asHex(row.transactionHash));
    } catch (error) {
      if (error instanceof AppError && error.code === "GAS_SPONSOR_REVERTED")
        this.db
          .update(tripGasSponsorships)
          .set({ errorCode: error.code })
          .where(eq(tripGasSponsorships.creationId, creationId))
          .run();
      throw error;
    }
    this.db
      .update(tripGasSponsorships)
      .set({ confirmed: true })
      .where(eq(tripGasSponsorships.creationId, creationId))
      .run();
    return WalletTransaction.parse(JSON.parse(row.walletTransaction));
  }
}
