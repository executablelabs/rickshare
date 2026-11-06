import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const config = z
  .object({
    VITE_API_URL: z.preprocess(
      blankToUndefined,
      z.union([z.url(), z.literal("/api")]).default("http://localhost:8787"),
    ),
    VITE_ARC_RPC_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
    VITE_SEPOLIA_RPC_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
    VITE_PRIVY_APP_ID: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  })
  .parse(import.meta.env);
