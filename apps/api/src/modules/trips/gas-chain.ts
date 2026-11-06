import { asHex, type WalletTransaction } from "@rickshare/shared";
import { type Address, getAddress, type Hex, parseUnits, TransactionNotFoundError } from "viem";
import { AppError } from "../../lib/errors";
import { arcFees, assertArcChain, createArcClient, createArcWallet } from "../chain/clients";

export type GasSponsorChain = {
  quote(transaction: WalletTransaction): Promise<bigint>;
  sign(recipient: Address, amount: bigint): Promise<Hex>;
  broadcast(signedTransaction: Hex, hash: Hex): Promise<void>;
  confirm(hash: Hex): Promise<void>;
};

export function createGasSponsorChain(
  key: string,
  client = createArcClient(),
  wallet = createArcWallet(key, client.transport.url),
): GasSponsorChain {
  return {
    async quote(transaction) {
      await assertArcChain(client);
      const maxFeePerGas = BigInt(transaction.maxFeePerGas);
      const gas = await client.estimateGas({
        account: getAddress(transaction.from),
        to: getAddress(transaction.to),
        data: asHex(transaction.data),
        value: 0n,
        maxFeePerGas,
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
        // A fresh embedded wallet has no gas balance yet. The override is simulation-only.
        stateOverride: [
          { address: getAddress(transaction.from), balance: parseUnits("1000000", 18) },
        ],
      });
      return ((gas * 125n + 99n) / 100n) * maxFeePerGas;
    },
    async sign(recipient, amount) {
      await assertArcChain(client);
      const balance = await client.getBalance({ address: wallet.account.address });
      const insufficientBalance = new AppError(
        "GAS_SPONSOR_EMPTY",
        "Rickshare's setup-fee balance needs a top-up. Please try again later.",
        503,
      );
      if (balance <= amount) throw insufficientBalance;
      const fees = await arcFees(client);
      const gas = await client.estimateGas({
        account: wallet.account,
        to: recipient,
        value: amount,
        ...fees,
      });
      if (balance < amount + gas * fees.maxFeePerGas) throw insufficientBalance;
      return wallet.signTransaction({
        to: recipient,
        value: amount,
        gas,
        nonce: await client.getTransactionCount({
          address: wallet.account.address,
          blockTag: "pending",
        }),
        ...fees,
      });
    },
    async broadcast(signedTransaction, hash) {
      await assertArcChain(client);
      try {
        await client.getTransaction({ hash });
      } catch (error) {
        if (!(error instanceof TransactionNotFoundError)) throw error;
        await client.sendRawTransaction({ serializedTransaction: signedTransaction });
      }
    },
    async confirm(hash) {
      await assertArcChain(client);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success")
        throw new AppError(
          "GAS_SPONSOR_REVERTED",
          "The setup fee could not be covered. Please contact Rickshare.",
          503,
        );
    },
  };
}
