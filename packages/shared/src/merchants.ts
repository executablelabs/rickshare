import { z } from "zod";
import { Address, Ticket, UsdcAmount } from "./schemas";
import { MerchantPayment } from "./x402";

export const MerchantCatalog = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    address: Address.optional(),
    payment: MerchantPayment.optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          location: z.string().min(1),
          unitPrice: UsdcAmount,
        }),
      )
      .min(1),
  }),
);

export const MerchantQuoteRequest = z
  .object({
    merchantId: z.string().min(1).max(128),
    itemId: z.string().min(1).max(128),
    vaultAddress: Address,
    quantity: z.number().int().min(1).max(32),
    startsAt: z.string().datetime(),
  })
  .strict();

export const TicketBundle = z.object({
  ticket: Ticket,
  vaultAddress: Address,
  merchantName: z.string(),
  title: z.string(),
  location: z.string(),
  startsAt: z.string().datetime(),
  quantity: z.number().int().positive(),
});
