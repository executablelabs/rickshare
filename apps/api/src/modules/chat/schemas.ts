import { z } from "zod";

export const ChatInput = z
  .object({ requestId: z.string().uuid(), text: z.string().trim().min(1).max(4000) })
  .strict();
export const ChatQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(40) });
export const StreamCursor = z
  .string()
  .regex(/^\d{1,16}$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
