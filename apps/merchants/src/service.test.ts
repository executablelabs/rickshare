import { afterEach, expect, test } from "bun:test";
import { asHex, quoteTypedData, type SignedQuote } from "@rickshare/shared";
import { getAddress, type Hex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "./app";
import type { MerchantChain } from "./chain";
import { MerchantService } from "./service";
import { MerchantStore } from "./store";

const merchant = privateKeyToAccount(`0x${"01".repeat(32)}`);
const vault = getAddress("0x0000000000000000000000000000000000000123");
const member = getAddress("0x0000000000000000000000000000000000000456");
const stores: MerchantStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function fixture() {
  const now = Date.now();
  const store = new MerchantStore(":memory:");
  stores.push(store);
  let signed: SignedQuote | undefined;
  let status = 1;
  let ticketHash: Hex = `0x${"00".repeat(32)}`;
  let payments = 0;
  let loseReceipt = false;
  const hash = `0x${"11".repeat(32)}` as const;
  const chain: MerchantChain = {
    chainId: 5042002,
    scope: "test-scope",
    head: async () => 1n,
    blockHash: async () => hash,
    validate: async (address, recipient) => {
      if (address !== vault || recipient !== merchant.address)
        throw new Error("Unknown vault/merchant");
      return { endsAt: BigInt(Math.floor(now / 1000) + 86400) };
    },
    created: async () => [vault],
    locked: async () => [{ vault, proposalId: "1" }],
    purchase: async () => {
      if (!signed) throw new Error("No quote was issued");
      return {
        merchant: merchant.address,
        total: BigInt(signed.total),
        quoteHash: signed.quoteHash as Hex,
        ticketHash,
        deadline: BigInt(Math.floor(now / 1000) + 600),
        status,
        participants: [member],
      };
    },
    fulfill: async (_vault, _id, hash) => {
      payments += 1;
      status = 2;
      ticketHash = hash;
      if (loseReceipt) throw new Error("Connection lost after payment was finalized");
    },
  };
  const options = {
    publicUrl: "https://merchant.example/bookings",
    accounts: new Map([["elephanta-walks", merchant]]),
    now: () => now,
  };
  const service = new MerchantService(store, chain, options);
  const input = {
    merchantId: "elephanta-walks",
    itemId: "elephanta-ferry-walk",
    vaultAddress: vault,
    quantity: 2,
    startsAt: new Date(now + 3600_000).toISOString(),
  };
  return {
    store,
    chain,
    service,
    options,
    input,
    issue: async () => {
      signed = await service.quote(input);
      return signed;
    },
    payments: () => payments,
    loseReceipt: () => {
      loseReceipt = true;
    },
    restart: () => new MerchantService(store, chain, options),
  };
}

test("quotes use only catalog prices and the configured merchant signer", async () => {
  const f = fixture();
  const quote = await f.issue();
  expect(quote.total).toBe("50000000");
  expect(quote.merchant).toBe(merchant.address);
  expect(
    await verifyTypedData({
      ...quoteTypedData(quote),
      address: merchant.address,
      signature: quote.signature as Hex,
    }),
  ).toBe(true);
  expect(f.store.quote(quote.quoteHash)).toEqual(quote);
  await expect(f.service.quote({ ...f.input, payee: member })).rejects.toThrow();
  await expect(f.service.quote({ ...f.input, unitPrice: "1" })).rejects.toThrow();
  await expect(f.service.quote({ ...f.input, merchantId: "unknown" })).rejects.toThrow(
    "does not offer",
  );
});

test("paid tickets survive service reconstruction and receipt-loss recovery without paying twice", async () => {
  const f = fixture();
  await f.issue();
  f.loseReceipt();
  await expect(f.service.deliver(vault, "1")).rejects.toThrow("Connection lost");
  const prepared = f.store.ticketFor(vault, "1");
  if (!prepared) throw new Error("Missing prepared ticket");
  expect(() => f.service.ticket(prepared.id)).toThrow("not available");
  const restarted = f.restart();
  await restarted.deliver(vault, "1");
  expect(f.payments()).toBe(1);
  const ticket = restarted.ticket(prepared.id);
  expect(ticket.ticket.holders).toEqual([member]);
  expect(ticket.ticket.url).toStartWith("https://merchant.example/bookings/tickets/");
  expect(ticket.ticketHash).toBe(asHex(prepared.hash));
});

test("watcher jobs are durable and replay cannot issue or pay for a purchase twice", async () => {
  const f = fixture();
  await f.issue();
  await Promise.all([f.service.sync(), f.service.sync()]);
  await f.restart().sync();
  expect(f.payments()).toBe(1);
  expect(f.store.jobs("test-scope", Date.now())).toHaveLength(0);
  expect(f.service.ticketFor(vault, "1").ticket.proposalId).toBe("1");
});

test("ticket pages contain a QR code and internal lookup requires the service secret", async () => {
  const f = fixture();
  await f.issue();
  await f.service.deliver(vault, "1");
  const record = f.store.ticketFor(vault, "1");
  if (!record) throw new Error("Missing ticket");
  const apiSecret = "test-shared-service-secret-with-32-characters";
  const app = createApp({ service: f.service, apiSecret });
  const internalPath = `/internal/tickets/${vault}/1`;
  expect((await app.request(internalPath)).status).toBe(401);
  const authorized = await app.request(internalPath, {
    headers: { Authorization: `Bearer ${apiSecret}` },
  });
  expect(authorized.status).toBe(200);
  const page = await app.request(`/tickets/${record.id}`);
  expect(page.status).toBe(200);
  const content = await page.text();
  expect(content).toContain("data:image/png;base64,");
  expect(content).toContain("Elephanta Caves ferry and guided walk");
  expect(page.headers.get("Referrer-Policy")).toBe("no-referrer");
});
