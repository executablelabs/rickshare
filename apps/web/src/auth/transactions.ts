import type { Address, Hex } from "viem";
import type { WalletCall } from "./wallet";

export class TransactionPendingError extends Error {
  readonly code = "TRANSACTION_PENDING";
  constructor(readonly transactionHash: Hex) {
    super("Your transaction is still being checked. Try again to check the same transaction.");
  }
}

/** Keep known broadcasts while their receipts are uncertain; retries must not send twice. */
export function createTransactionSender() {
  const pending = new Map<string, Hex>();
  const active = new Map<string, Promise<Hex>>();
  return (
    member: Address,
    call: WalletCall,
    transport: {
      broadcast: () => Promise<Hex>;
      receipt: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
    },
  ): Promise<Hex> => {
    if (call.from && call.from.toLowerCase() !== member.toLowerCase())
      return Promise.reject(
        new Error("The prepared transaction belongs to another account. Refresh the trip."),
      );
    const key = `${member.toLowerCase()}:${call.to.toLowerCase()}:${call.data.toLowerCase()}`;
    const existing = active.get(key);
    if (existing) return existing;
    const task = (async () => {
      const hash = pending.get(key) ?? (await transport.broadcast());
      pending.set(key, hash);
      let receipt: { status: "success" | "reverted" };
      try {
        receipt = await transport.receipt(hash);
      } catch {
        throw new TransactionPendingError(hash);
      }
      pending.delete(key);
      if (receipt.status !== "success")
        throw new Error("The transaction failed, so nothing in the trip changed. Try again.");
      return hash;
    })().finally(() => active.delete(key));
    active.set(key, task);
    return task;
  };
}
