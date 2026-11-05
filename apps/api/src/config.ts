import { Address } from "@kitty/shared";
import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalText = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const optionalAddress = z.preprocess(blankToUndefined, Address.optional());
const optionalPrivateKey = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
);

export const configSchema = z.object({
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(8787)),
  DATABASE_PATH: z.preprocess(blankToUndefined, z.string().min(1).default("kitty.sqlite")),
  WEB_ORIGIN: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:5173")),
  ARC_RPC_URL: optionalUrl,
  ARC_WS_URL: optionalUrl,
  SEPOLIA_RPC_URL: optionalUrl,
  TRIP_FACTORY_ADDRESS: optionalAddress,
  AGENT_PRIVATE_KEY: optionalPrivateKey,
  VERIFIER_PRIVATE_KEY: optionalPrivateKey,
  ENS_ADMIN_PRIVATE_KEY: optionalPrivateKey,
  ENS_PARENT_NAME: optionalText,
  WORLD_ISSUER: optionalUrl,
  WORLD_CLIENT_ID: optionalText,
  WORLD_CLIENT_SECRET: optionalText,
  WORLD_REDIRECT_URI: optionalUrl,
  WORLD_MAX_AUTH_AGE_SECONDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(300),
  ),
  ATTESTATION_TTL_SECONDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(300),
  ),
  ANTHROPIC_API_KEY: optionalText,
  TAVILY_API_KEY: optionalText,
  MERCHANTS_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:8790")),
  SESSION_SECRET: z.preprocess(blankToUndefined, z.string().min(32).optional()),
  AUTH_NONCE_TTL_SECONDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(60).max(600).default(300),
  ),
  SESSION_TTL_SECONDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(60).max(604800).default(28800),
  ),
  ARC_START_BLOCK: z.preprocess(blankToUndefined, z.string().regex(/^\d+$/).default("0")),
  INDEXER_POLL_INTERVAL_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(500).max(60000).default(2000),
  ),
});

export const config = configSchema.parse(process.env);
