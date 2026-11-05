import { describe, expect, spyOn, test } from "bun:test";
import { AppError } from "../../lib/errors";
import {
  ALLOWLISTED_MERCHANT,
  ANGIE,
  BASHY,
  createFakePorts,
  GITAU,
  NOW,
  paraglidingQuote,
  TRIP,
} from "./test-fixtures";
import { createToolRun } from "./tools";

const quoteRequest = { merchantId: "goa-adventures", itemId: "arambol-paragliding", quantity: 2 };
const evenShares = [
  { member: ANGIE, amount: "42000000" },
  { member: GITAU, amount: "42000000" },
];

async function runWithQuote(ports = createFakePorts().ports) {
  const run = createToolRun(TRIP.id, ports, () => NOW);
  const quote = await run.execute("get_quote", quoteRequest);
  expect(quote.isError).toBe(false);
  return run;
}

describe("propose_purchase", () => {
  test("submits the quote exactly as the merchant issued it, with bigint shares", async () => {
    const fake = createFakePorts();
    const run = await runWithQuote(fake.ports);

    const result = await run.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: evenShares,
    });

    expect(result).toEqual({ content: '{"proposalId":"1","status":"pending"}', isError: false });
    expect(fake.submitted).toEqual([
      {
        tripId: TRIP.id,
        quote: paraglidingQuote(),
        shares: [
          { member: ANGIE, amount: 42_000_000n },
          { member: GITAU, amount: 42_000_000n },
        ],
      },
    ]);
    expect(run.proposalIds).toEqual(["1"]);
  });

  test("submits the trip's own member address, whatever casing the model used", async () => {
    const fake = createFakePorts();
    const run = await runWithQuote(fake.ports);
    await run.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: [
        { member: ANGIE.replace("a1", "A1"), amount: "42000000" },
        { member: GITAU.replace("c3", "C3"), amount: "42000000" },
      ],
    });
    expect(fake.submitted[0]?.shares.map((share) => share.member)).toEqual([ANGIE, GITAU]);
  });

  test("rejects a payee or any other extra field instead of ignoring it", async () => {
    const fake = createFakePorts();
    const run = await runWithQuote(fake.ports);
    const result = await run.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: evenShares,
      payee: "0x00000000000000000000000000000000000000ee",
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("payee");
    expect(fake.submitted).toEqual([]);
  });

  test.each([
    ["a quote this turn never fetched", { quoteId: "q-made-up", shares: evenShares }, "Unknown"],
    [
      "a non-member",
      {
        quoteId: "q-paragliding",
        shares: [
          { member: ANGIE, amount: "42000000" },
          { member: "0x00000000000000000000000000000000000000ee", amount: "42000000" },
        ],
      },
      "not a member",
    ],
    [
      "the same member twice",
      {
        quoteId: "q-paragliding",
        shares: [
          { member: ANGIE, amount: "42000000" },
          { member: ANGIE.toUpperCase().replace("0X", "0x"), amount: "42000000" },
        ],
      },
      "more than one share",
    ],
    [
      "a zero share",
      {
        quoteId: "q-paragliding",
        shares: [
          { member: ANGIE, amount: "84000000" },
          { member: BASHY, amount: "0" },
        ],
      },
      "more than zero",
    ],
    [
      "shares that do not add up",
      { quoteId: "q-paragliding", shares: [{ member: ANGIE, amount: "42000000" }] },
      "add up to 42000000",
    ],
    [
      "a decimal amount",
      { quoteId: "q-paragliding", shares: [{ member: ANGIE, amount: "84.00" }] },
      "Invalid input",
    ],
  ])("rejects %s", async (_case, input, message) => {
    const fake = createFakePorts();
    const run = await runWithQuote(fake.ports);
    const result = await run.execute("propose_purchase", input);
    expect(result.isError).toBe(true);
    expect(result.content).toContain(message);
    expect(fake.submitted).toEqual([]);
  });

  test("rejects an expired quote and a quote that was already proposed", async () => {
    const expired = createFakePorts({
      getQuote: async () => paraglidingQuote({ expiresAt: NOW.toISOString() }),
    });
    const expiredRun = await runWithQuote(expired.ports);
    const late = await expiredRun.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: evenShares,
    });
    expect(late.content).toContain("expired");

    const fake = createFakePorts();
    const run = await runWithQuote(fake.ports);
    await run.execute("propose_purchase", { quoteId: "q-paragliding", shares: evenShares });
    const again = await run.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: evenShares,
    });
    expect(again.content).toContain("Unknown quoteId");
    expect(fake.submitted).toHaveLength(1);
  });
});

test("a failed submission is never retried with the same quote", async () => {
  let attempts = 0;
  const fake = createFakePorts({
    submitProposal: async () => {
      attempts += 1;
      throw new Error("receipt timed out");
    },
  });
  const run = await runWithQuote(fake.ports);
  const proposal = { quoteId: "q-paragliding", shares: evenShares };

  const first = await run.execute("propose_purchase", proposal);
  expect(first).toMatchObject({ isError: true });
  expect(first.content).toContain("Do not propose it again");

  const retry = await run.execute("propose_purchase", proposal);
  expect(retry.content).toContain("Unknown quoteId");
  expect(attempts).toBe(1);
  expect(run.proposalIds).toEqual([]);
});

describe("other tools", () => {
  test("wraps outside content and hides the payee and signature from the model", async () => {
    const fake = createFakePorts();
    const run = createToolRun(TRIP.id, fake.ports, () => NOW);
    const quote = await run.execute("get_quote", quoteRequest);
    expect(quote.content.startsWith('<untrusted_data source="merchant_quote">')).toBe(true);
    expect(quote.content).not.toContain(ALLOWLISTED_MERCHANT);
    expect(quote.content).not.toContain("signature");

    const merchants = await run.execute("list_merchants", {});
    expect(merchants.content.startsWith('<untrusted_data source="merchant_catalog">')).toBe(true);
    const tripState = await run.execute("get_trip_state", {});
    expect(tripState.content).toContain("Bashy");
    expect(tripState.content).not.toContain(TRIP.vaultAddress);
  });

  test.each([
    [
      "another trip's vault",
      { vaultAddress: "0x3333333333333333333333333333333333333333" },
      "different trip",
    ],
    [
      "a payee other than the listed merchant",
      { merchant: "0x00000000000000000000000000000000000000ee" },
      "other than the listed merchant",
    ],
  ])("refuses a quote bound to %s", async (_case, overrides, message) => {
    const fake = createFakePorts({ getQuote: async () => paraglidingQuote(overrides) });
    const run = createToolRun(TRIP.id, fake.ports, () => NOW);
    const result = await run.execute("get_quote", quoteRequest);
    expect(result.isError).toBe(true);
    expect(result.content).toContain(message);
    const proposal = await run.execute("propose_purchase", {
      quoteId: "q-paragliding",
      shares: evenShares,
    });
    expect(proposal.content).toContain("Unknown quoteId");
    expect(fake.submitted).toEqual([]);
  });

  test("refuses a merchant id that is not in the catalog", async () => {
    const run = createToolRun(TRIP.id, createFakePorts().ports, () => NOW);
    const result = await run.execute("get_quote", { ...quoteRequest, merchantId: "evil-tours" });
    expect(result).toMatchObject({ isError: true });
    expect(result.content).toContain("not a merchant from list_merchants");
  });

  test("refuses an unsigned quote without the vault binding", async () => {
    const bindingFields = new Set(["location", "vaultAddress", "chainId"]);
    const unbound = Object.fromEntries(
      Object.entries(paraglidingQuote()).filter(([field]) => !bindingFields.has(field)),
    );
    const fake = createFakePorts({ getQuote: async () => unbound });
    const run = createToolRun(TRIP.id, fake.ports, () => NOW);
    expect((await run.execute("get_quote", quoteRequest)).isError).toBe(true);
  });

  test("rejects a quote for a different item than requested", async () => {
    const fake = createFakePorts({ getQuote: async () => paraglidingQuote({ quantity: 3 }) });
    const run = createToolRun(TRIP.id, fake.ports, () => NOW);
    const result = await run.execute("get_quote", quoteRequest);
    expect(result).toMatchObject({ isError: true });
  });

  test("hides service failures behind a generic message", async () => {
    const fake = createFakePorts({
      searchActivities: async () => {
        throw new Error("upstream said: key tvly-secret is invalid");
      },
    });
    const run = createToolRun(TRIP.id, fake.ports, () => NOW);
    const result = await run.execute("search_activities", { query: "goa" });
    expect(result).toEqual({
      content: "search_activities is unavailable right now.",
      isError: true,
    });
  });

  test("logs a stable cause code without the raw error text", async () => {
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const fake = createFakePorts({
        searchActivities: async () => {
          throw new AppError("SEARCH_FAILED", "key tvly-secret rejected", 502);
        },
      });
      await createToolRun(TRIP.id, fake.ports, () => NOW).execute("search_activities", {
        query: "goa",
      });
      const logged = stderr.mock.calls.map(([line]) => String(line)).join("");
      expect(logged).toContain('"code":"AGENT_TOOL_FAILED.SEARCH_FAILED"');
      expect(logged).not.toContain("tvly-secret");
    } finally {
      stderr.mockRestore();
    }
  });

  test("passes itinerary drafts through and rejects unknown tools", async () => {
    const fake = createFakePorts();
    const run = createToolRun(TRIP.id, fake.ports, () => NOW, ["1"]);
    const item = {
      id: null,
      startsAt: "2026-12-14T10:00:00.000Z",
      title: "Paragliding",
      location: "Arambol",
      proposalId: "1",
    };
    expect(await run.execute("update_itinerary", { items: [item] })).toEqual({
      content: '{"itineraryItems":1}',
      isError: false,
    });
    expect(fake.itineraries).toEqual([[item]]);
    expect((await run.execute("send_funds", {})).isError).toBe(true);
  });

  test("links itinerary items only to proposals of this trip", async () => {
    const fake = createFakePorts();
    const run = createToolRun(TRIP.id, fake.ports, () => NOW, ["1"]);
    const item = {
      id: null,
      startsAt: "2026-12-14T10:00:00.000Z",
      title: "Paragliding",
      location: "Arambol",
      proposalId: "other-trip-9",
    };
    const result = await run.execute("update_itinerary", { items: [item] });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("other-trip-9 is not a proposal of this trip");
    expect(fake.itineraries).toEqual([]);
  });
});
