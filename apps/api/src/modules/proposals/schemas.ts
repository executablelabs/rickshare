import { Address, SignedQuote } from "@kitty/shared";
import { getAddress } from "viem";
import { z } from "zod";

export const ProposalParams = z.object({
  tripId: Address.transform((value) => getAddress(value)),
  proposalId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .max(78),
});
export const TripProposalParams = ProposalParams.omit({ proposalId: true });
export const ProposalInput = z
  .object({
    quote: SignedQuote,
    shares: z
      .array(z.object({ member: Address, amount: z.string().regex(/^\d{1,78}$/) }).strict())
      .min(1)
      .max(32),
  })
  .strict();
