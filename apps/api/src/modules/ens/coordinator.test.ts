import { expect, test } from "bun:test";
import type { ItineraryItem, Trip } from "@rickshare/shared";
import { getAddress } from "viem";
import { createDatabase } from "../../db/client";
import { ensTrips } from "../../db/schema";
import { EnsCoordinator, publicItinerary } from "./coordinator";
import type { TripNamesInput } from "./service";
import { createEnsStore } from "./store";

const address = getAddress("0x0000000000000000000000000000000000000001");
const item: ItineraryItem = {
  id: "one",
  title: "Guided walk",
  location: "Mumbai",
  startsAt: "2030-01-01T10:00:00.000Z",
  proposalId: "1",
  ticketUrls: ["https://tickets.example/secret"],
};
const trip: Trip = {
  id: address.toLowerCase(),
  vaultAddress: address,
  name: "Goa",
  endsAt: "2031-01-01T00:00:00.000Z",
  ensName: null,
  members: [
    {
      address,
      displayName: "Alice",
      ensName: null,
      worldLinked: true,
      policy: { autoApproveMax: "0", totalCap: "0" },
      deposited: "0",
      spent: "0",
      locked: "0",
      available: "0",
    },
  ],
};

test("publication excludes bearer links and bounds UTF-8 bytes", () => {
  expect(publicItinerary([item])).not.toContain("secret");
  expect(publicItinerary([item])).not.toContain("proposalId");
  expect(
    new TextEncoder().encode(
      publicItinerary(Array.from({ length: 100 }, () => ({ ...item, title: "旅".repeat(160) }))),
    ).length,
  ).toBeLessThanOrEqual(4096);
});

test("failed provisioning retries after reconstruction; concurrent syncs serialize and unchanged summaries do not resend", async () => {
  const db = createDatabase(":memory:");
  try {
    let attempts = 0;
    let publications = 0;
    let refreshes = 0;
    let items = [item];
    const ens = {
      async provisionTrip(input: TripNamesInput) {
        attempts++;
        if (attempts === 1) throw new Error("RPC offline");
        const name = `${input.label}.rickshare.eth`;
        return {
          trip: name,
          agent: `agent.${name}`,
          registry: address,
          resolver: address,
          members: { [address]: `alice.${name}` },
        };
      },
      async writeItinerary(_names: unknown, summary: string) {
        publications++;
        expect(summary).not.toContain("secret");
        return "0x01" as const;
      },
    };
    const source = {
      trips: () => [trip],
      itinerary: () => items,
      refresh: () => {
        refreshes++;
      },
    };
    const worker = () => new EnsCoordinator(createEnsStore(db, "rickshare.eth"), ens, source);
    await worker().sync();
    expect(db.select().from(ensTrips).get()?.errorCode).toBe("ENS_SYNC_FAILED");
    const restarted = worker();
    await Promise.all([restarted.sync(), restarted.sync()]);
    expect(attempts).toBe(2);
    expect(publications).toBe(1);
    expect(refreshes).toBe(1);
    await restarted.sync();
    expect(publications).toBe(1);
    items = [{ ...item, title: "Ferry" }];
    await restarted.sync();
    expect(publications).toBe(2);
    restarted.stop();
    await restarted.sync();
    expect(publications).toBe(2);
  } finally {
    db.$client.close();
  }
});

test("publication failures retain names and retry without reprovisioning; expired trips are skipped", async () => {
  const db = createDatabase(":memory:");
  try {
    const store = createEnsStore(db, "rickshare.eth");
    const pending = store.prepare(trip);
    store.confirm(trip.id, {
      trip: pending.saved.name,
      agent: `agent.${pending.saved.name}`,
      registry: address,
      resolver: address,
      members: { [address]: `alice.${pending.saved.name}` },
    });
    let calls = 0;
    let now = Date.now();
    const worker = new EnsCoordinator(
      store,
      {
        provisionTrip: async () => {
          throw new Error("must not reprovision");
        },
        writeItinerary: async () => {
          calls++;
          if (calls === 1) throw new Error("RPC offline");
          return "0x01";
        },
      },
      { trips: () => [trip], itinerary: () => [item], refresh: () => {}, now: () => now },
    );
    await worker.sync();
    expect(db.select().from(ensTrips).get()?.resolver).toBe(address);
    expect(db.select().from(ensTrips).get()?.itineraryHash).toBeNull();
    await worker.sync();
    expect(calls).toBe(2);
    now = Date.parse(trip.endsAt);
    await worker.sync();
    expect(calls).toBe(2);
  } finally {
    db.$client.close();
  }
});
