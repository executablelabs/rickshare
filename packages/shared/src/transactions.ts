import { z } from "zod";
import { Address, Hex } from "./schemas";

export const WalletTransaction = z.object({
  chainId: z.literal(5042002),
  from: Address,
  to: Address,
  data: Hex.refine((value) => value.length % 2 === 0),
  value: z.literal("0x0"),
  maxFeePerGas: Hex,
  maxPriorityFeePerGas: Hex,
});
export type WalletTransaction = z.infer<typeof WalletTransaction>;
