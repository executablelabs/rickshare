import { afterEach, expect, test } from "bun:test";
import { type QuoteTerms, quoteTypedData, type SignedQuote } from "@kitty/shared";
import { getAddress, type Hex, hashTypedData, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type AppDatabase, createDatabase } from "../../db/client";
import { chainEvents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { ProposalChain } from "./chain";
import { ProposalService } from "./service";

const merchant = privateKeyToAccount(`0x${"04".repeat(32)}`);
const vault = getAddress("0x0000000000000000000000000000000000000123");
const alice = getAddress("0x0000000000000000000000000000000000000456");
const bob = getAddress("0x0000000000000000000000000000000000000789");
const transactionHash: Hex = `0x${"ab".repeat(32)}`;
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

async function fixture() {
  let now = Date.now();
  const db = createDatabase(":memory:");
  databases.push(db);
  let broadcasts = 0;
  let loseReceipt = false;
  let allowed = true;
  let recover = false;
  let active = 0;
  let maximumActive = 0;
  let payload = JSON.stringify({
    ticket: {
      proposalId: "7",
      code: "test-booking",
      url: "https://merchant.example/tickets/token",
      holders: [alice, bob],
    },
    vaultAddress: vault,
    merchantName: "Elephanta Walks",
    title: "Guided walk",
    location: "Mumbai",
    startsAt: "2030-01-01T12:00:00.000Z",
    quantity: 2,
  });
  let committedHash = keccak256(stringToHex(payload));
  const quote = async (changes: Partial<QuoteTerms> = {}): Promise<SignedQuote> => {
    const terms: QuoteTerms = {
      quoteId: "quote-1",
      itemId: "walk",
      merchant: merchant.address,
      title: "Guided walk",
      location: "Mumbai",
      unitPrice: "10000000",
      quantity: 2,
      total: "20000000",
      startsAt: new Date(now + 3600_000).toISOString(),
      expiresAt: new Date(now + 300_000).toISOString(),
      vaultAddress: vault,
      chainId: 5042002,
      ...changes,
    };
    const data = quoteTypedData(terms);
    return {
      ...terms,
      quoteHash: hashTypedData(data),
      signature: await merchant.signTypedData(data),
    };
  };
  const signed = await quote();
  const source: ProposalChain = {
    chainId: 5042002,
    validate: async (_vault, _merchant, people) => {
      if (!allowed) throw new AppError("MERCHANT_NOT_ALLOWED", "Merchant is not allowed.", 403);
      if (people.some((person) => person !== alice && person !== bob))
        throw new AppError("NOT_MEMBER", "Not a trip member.", 400);
      return { endsAt: BigInt(Math.floor(now / 1000) + 86400) };
    },
    broadcast: async () => {
      broadcasts += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Bun.sleep(1);
      active -= 1;
      return transactionHash;
    },
    confirm: async () => {
      if (loseReceipt) throw new Error("Receipt unavailable");
      return { proposalId: "7", transactionHash };
    },
    purchase: async () => ({ status: 2, ticketHash: committedHash, participants: [alice, bob] }),
  };
  const service = new ProposalService(
    db,
    source,
    { ticket: async () => ({ payload, ticketHash: committedHash }) },
    async () => {
      if (recover)
        db.insert(chainEvents)
          .values({
            id: "recovered",
            vault: vault.toLowerCase(),
            blockNumber: "1",
            blockHash: transactionHash,
            transactionHash,
            logIndex: 0,
            name: "Proposed",
            proposalId: "7",
            payload: JSON.stringify({ quoteHash: signed.quoteHash }),
          })
          .onConflictDoNothing()
          .run();
    },
    () => now,
  );
  const request = {
    tripId: vault,
    quote: signed,
    shares: [
      { member: alice, amount: 10_000_000n },
      { member: bob, amount: 10_000_000n },
    ],
  };
  return {
    service,
    signed,
    quote,
    request,
    broadcasts: () => broadcasts,
    maximumActive: () => maximumActive,
    loseReceipt: () => {
      loseReceipt = true;
    },
    recover: () => {
      recover = true;
    },
    disallow: () => {
      allowed = false;
    },
    advance: (value: number) => {
      now += value;
    },
    tamper: () => {
      payload = payload.replace("test-booking", "changed-booking");
    },
    duplicateHolder: () => {
      payload = payload.replace(bob, alice);
      committedHash = keccak256(stringToHex(payload));
    },
  };
}

test("valid submissions are idempotent, including reordered shares and later expiry", async () => {
  const f = await fixture();
  expect(await f.service.submitProposal(f.request)).toEqual({ proposalId: "7", transactionHash });
  f.advance(600_000);
  expect(
    await f.service.submitProposal({ ...f.request, shares: [...f.request.shares].reverse() }),
  ).toEqual({ proposalId: "7", transactionHash });
  expect(f.broadcasts()).toBe(1);
});

test("ambiguous submission failures never broadcast the same quote again and recover from indexed history", async () => {
  const f = await fixture();
  f.loseReceipt();
  await expect(f.service.submitProposal(f.request)).rejects.toThrow("may still complete");
  await expect(f.service.submitProposal(f.request)).rejects.toThrow("already submitted");
  expect(f.broadcasts()).toBe(1);
  f.recover();
  expect(await f.service.submitProposal(f.request)).toEqual({ proposalId: "7", transactionHash });
  expect(f.broadcasts()).toBe(1);
});

test("wrong context, modified signatures, invalid sums and duplicate members cannot submit", async () => {
  const f = await fixture();
  await expect(f.service.submitProposal({ ...f.request, tripId: alice })).rejects.toThrow(
    "different trip or chain",
  );
  await expect(
    f.service.submitProposal({ ...f.request, quote: { ...f.signed, total: "1" } }),
  ).rejects.toThrow("could not be verified");
  await expect(
    f.service.submitProposal({ ...f.request, shares: [{ member: alice, amount: 0n }] }),
  ).rejects.toThrow("positive, unique");
  await expect(
    f.service.submitProposal({
      ...f.request,
      shares: [
        { member: alice, amount: 10_000_000n },
        { member: alice, amount: 10_000_000n },
      ],
    }),
  ).rejects.toThrow("positive, unique");
  f.disallow();
  await expect(f.service.submitProposal(f.request)).rejects.toThrow("Merchant is not allowed");
  expect(f.broadcasts()).toBe(0);
});

test("expired quotes and non-member shares are rejected before reserving a submission", async () => {
  const f = await fixture();
  await expect(
    f.service.submitProposal({
      ...f.request,
      shares: [{ member: merchant.address, amount: 20_000_000n }],
    }),
  ).rejects.toThrow("Not a trip member");
  const expired = await f.quote({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  await expect(f.service.submitProposal({ ...f.request, quote: expired })).rejects.toThrow(
    "new merchant quote",
  );
  expect(f.broadcasts()).toBe(0);
});

test("all proposer transactions share a serialized queue", async () => {
  const f = await fixture();
  const second = await f.quote({ quoteId: "quote-2" });
  await Promise.all([
    f.service.submitProposal(f.request),
    f.service.submitProposal({ ...f.request, quote: second }),
  ]);
  expect(f.broadcasts()).toBe(2);
  expect(f.maximumActive()).toBe(1);
});

test("ticket lookup checks participation, the paid hash and exact holder set", async () => {
  const f = await fixture();
  expect((await f.service.ticket(vault, "7", alice)).url).toBe(
    "https://merchant.example/tickets/token",
  );
  await expect(f.service.ticket(vault, "7", merchant.address)).rejects.toThrow(
    "does not include you",
  );
  f.tamper();
  await expect(f.service.ticket(vault, "7", alice)).rejects.toThrow(
    "does not match the paid purchase",
  );
  f.duplicateHolder();
  await expect(f.service.ticket(vault, "7", alice)).rejects.toThrow("participants");
});
