import { afterEach, expect, test } from "bun:test";
import { createApp } from "./app";
import { Catalog } from "./schemas";
import { MerchantService } from "./service";
import { MerchantStore } from "./store";

const stores: MerchantStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function app() {
  const store = new MerchantStore(":memory:");
  stores.push(store);
  return createApp({
    service: new MerchantService(store, undefined, {
      publicUrl: "http://localhost:8790",
      accounts: new Map(),
    }),
  });
}

test("health responds without chain access", async () => {
  const response = await app().request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("catalog supplies three mock merchants with valid USDC base-unit prices", async () => {
  const response = await app().request("/catalog");
  expect(response.status).toBe(200);
  const catalog = Catalog.parse(await response.json());
  expect(catalog).toHaveLength(3);
  expect(
    catalog.flatMap((merchant) => merchant.items).every((item) => BigInt(item.unitPrice) > 0n),
  ).toBe(true);
});
