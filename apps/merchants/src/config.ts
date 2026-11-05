import { Address } from "@kitty/shared";
import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const privateKey = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
);

export const config = z
  .object({
    PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(8790)),
    ARC_RPC_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
    TRIP_FACTORY_ADDRESS: z.preprocess(blankToUndefined, Address.optional()),
    MERCHANT_1_PRIVATE_KEY: privateKey,
    MERCHANT_2_PRIVATE_KEY: privateKey,
    MERCHANT_3_PRIVATE_KEY: privateKey,
    PUBLIC_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:8790")),
  })
  .parse(process.env);
