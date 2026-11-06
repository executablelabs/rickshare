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
