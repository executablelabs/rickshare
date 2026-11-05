import { arcTestnet } from "@rickshare/shared";
import { getAddress, type Hex } from "viem";
import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => getAddress(value));
const privateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/)
  .transform((value) => value as Hex);

export const deploymentConfig = z.object({
  ARC_RPC_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default(arcTestnet.rpcUrls.default.http[0]),
  ),
  DEPLOYER_PRIVATE_KEY: privateKey,
  AGENT_ADDRESS: address,
  VERIFIER_ADDRESS: address,
  MERCHANT_1_ADDRESS: address,
  MERCHANT_2_ADDRESS: address,
  MERCHANT_3_ADDRESS: address,
});

export function readDeploymentConfig() {
  return deploymentConfig.parse(process.env);
}

export const seedConfig = deploymentConfig.extend({
  TRIP_FACTORY_ADDRESS: z.preprocess(blankToUndefined, address.optional()),
  DEMO_MEMBER_1_PRIVATE_KEY: privateKey,
  DEMO_MEMBER_2_PRIVATE_KEY: privateKey,
  DEMO_MEMBER_3_PRIVATE_KEY: privateKey,
  DEMO_DEPOSIT_USDC: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .default("100"),
  ),
  DEMO_TRIP_NAME: z.preprocess(blankToUndefined, z.string().min(1).max(40).default("India 26")),
});

export function readSeedConfig() {
  return seedConfig.parse(process.env);
}
