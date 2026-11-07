import { expect, test } from "bun:test";
import { configSchema } from "./config";

test("blank example values fall back to local defaults", () => {
  const config = configSchema.parse({ PORT: "", DATABASE_PATH: "", WORLD_CLIENT_SECRET: "" });
  expect(config.PORT).toBe(8787);
  expect(config.DATABASE_PATH).toBe("rickshare.sqlite");
  expect(config.WORLD_CLIENT_SECRET).toBeUndefined();
});

test("invalid ports, addresses and keys fail configuration validation", () => {
  expect(configSchema.safeParse({ PORT: "0" }).success).toBe(false);
  expect(configSchema.safeParse({ TRIP_FACTORY_ADDRESS: "not-an-address" }).success).toBe(false);
  expect(configSchema.safeParse({ AGENT_PRIVATE_KEY: "not-a-key" }).success).toBe(false);
  expect(configSchema.safeParse({ GAS_SPONSOR_PRIVATE_KEY: "not-a-key" }).success).toBe(false);
  expect(configSchema.safeParse({ GAS_SPONSOR_MAX_FEE_USDC: "-1" }).success).toBe(false);
  expect(configSchema.safeParse({ GAS_SPONSOR_DAILY_BUDGET_USDC: "1e6" }).success).toBe(false);
});

test("World human approval is opt-in and uses separate app and RP credentials", () => {
  expect(configSchema.parse({}).WORLD_HUMAN_APPROVAL_ENABLED).toBe(false);
  expect(
    configSchema.parse({ WORLD_HUMAN_APPROVAL_ENABLED: "true" }).WORLD_HUMAN_APPROVAL_ENABLED,
  ).toBe(true);
  expect(configSchema.safeParse({ WORLD_HUMAN_APPROVAL_ENABLED: "yes" }).success).toBe(false);
  expect(configSchema.safeParse({ WORLD_APP_ID: "oidc_client" }).success).toBe(false);
  expect(configSchema.safeParse({ WORLD_RP_ID: "app_wrong" }).success).toBe(false);
  expect(configSchema.safeParse({ WORLD_SIGNING_KEY: "not-a-key" }).success).toBe(false);
});
