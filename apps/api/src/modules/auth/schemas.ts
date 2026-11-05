import { asHex } from "@kitty/shared";
import { z } from "zod";

export const LoginInput = z.object({
  message: z.string().min(1).max(8192),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .min(130)
    .max(8194)
    .refine((value) => value.length % 2 === 0)
    .transform(asHex),
});
