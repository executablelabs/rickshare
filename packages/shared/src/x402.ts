import { z } from "zod";
import { Address, UsdcAmount } from "./schemas";

export const MerchantPayment = z.object({
  protocol: z.literal("x402"),
  network: z.literal("eip155:84532"),
  asset: Address,
});

export const X402PaymentRequired = z.object({
  x402Version: z.literal(2),
  resource: z.object({
    url: z.string().url(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  accepts: z
    .array(
      z.object({
        scheme: z.literal("exact"),
        network: z.literal("eip155:84532"),
        asset: Address,
        amount: UsdcAmount.refine((value) => BigInt(value) > 0n),
        payTo: Address,
        maxTimeoutSeconds: z.number().int().positive().max(300),
        extra: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(10),
  error: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});
export type X402PaymentRequired = z.infer<typeof X402PaymentRequired>;

// Separate from vault tickets: an x402 booking does not imply a fulfilled vault proposal.
export const X402Booking = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
  code: z.string().min(1),
  url: z.string().url(),
  quoteId: z.string().min(1),
  quoteHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  vaultAddress: Address,
  merchant: Address,
  title: z.string(),
  location: z.string(),
  startsAt: z.string().datetime(),
  quantity: z.number().int().positive(),
});
