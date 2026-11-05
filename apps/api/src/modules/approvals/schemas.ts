import { Address, Hex, UsdcAmount } from "@rickshare/shared";
import { getAddress } from "viem";
import { z } from "zod";

export const ApprovalParams = z.object({
  tripId: Address.transform((value) => getAddress(value)),
  proposalId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .max(78),
});
export const WorldCallback = z.object({
  state: z.string().min(32).max(128),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(128).optional(),
});
export const WorldRequestParams = z.object({ requestId: z.string().min(32).max(128) });
export const Attestation = z.object({
  vaultAddress: Address,
  proposalId: UsdcAmount,
  member: Address,
  amount: UsdcAmount,
  nonce: UsdcAmount,
  deadline: UsdcAmount,
  chainId: z.number().int().positive(),
  signature: Hex,
});
export type Attestation = z.infer<typeof Attestation>;
