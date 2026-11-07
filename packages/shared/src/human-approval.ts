import { z } from "zod";
import { Address, Hex, UsdcAmount } from "./schemas";

export const WorldProofEnvironment = z.enum(["production", "staging"]);
export type WorldProofEnvironment = z.infer<typeof WorldProofEnvironment>;

export const HumanApprovalChallenge = z.object({
  appId: z.string().regex(/^app_[a-zA-Z0-9_-]+$/),
  environment: WorldProofEnvironment.optional(),
  action: z.string().regex(/^rickshare:approve:[a-f0-9]{64}$/),
  signal: z.string().regex(/^rickshare-member:0x[a-f0-9]{40}$/),
  rpContext: z.object({
    rp_id: z.string().regex(/^rp_[a-zA-Z0-9_-]+$/),
    nonce: Hex,
    signature: Hex,
    created_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  }),
  share: z.object({
    chainId: z.literal(5042002),
    vaultAddress: Address,
    proposalId: UsdcAmount,
    member: Address,
    amount: UsdcAmount,
    nonce: UsdcAmount,
    deadline: UsdcAmount,
    quoteExpiresAt: UsdcAmount,
  }),
});
export type HumanApprovalChallenge = z.infer<typeof HumanApprovalChallenge>;
