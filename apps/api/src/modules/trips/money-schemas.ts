import { z } from "zod";

const amount = z
  .string()
  .regex(/^\d{1,78}$/)
  .refine((value) => BigInt(value) <= (1n << 256n) - 1n);
const positive = amount.refine((value) => BigInt(value) > 0n);
export const MoneyAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deposit"), amount: positive }).strict(),
  z.object({ action: z.literal("withdraw"), amount: positive }).strict(),
  z.object({ action: z.literal("policy"), autoApproveMax: amount, totalCap: amount }).strict(),
  z.object({ action: z.literal("reject"), proposalId: positive }).strict(),
  z.object({ action: z.literal("refund"), proposalId: positive }).strict(),
  z.object({ action: z.literal("settle") }).strict(),
]);
export type MoneyAction = z.infer<typeof MoneyAction>;
export const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z
    .string()
    .regex(/^\d{1,18}:\d{1,7}$/)
    .optional(),
});
