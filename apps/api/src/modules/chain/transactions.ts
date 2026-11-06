import { arcTestnet, WalletTransaction } from "@rickshare/shared";
import { type Address, type Hex, numberToHex } from "viem";
import { arcFees, assertArcChain, type createArcClient } from "./clients";

export async function prepareWalletTransaction(
  client: ReturnType<typeof createArcClient>,
  from: Address,
  to: Address,
  data: Hex,
) {
  await assertArcChain(client);
  const fees = await arcFees(client);
  return WalletTransaction.parse({
    chainId: arcTestnet.id,
    from,
    to,
    data,
    value: "0x0",
    maxFeePerGas: numberToHex(fees.maxFeePerGas),
    maxPriorityFeePerGas: numberToHex(fees.maxPriorityFeePerGas),
  });
}
