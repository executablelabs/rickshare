import { afterEach, expect, test } from "bun:test";
import type { Member } from "@rickshare/shared";
import { eq } from "drizzle-orm";
import { getAddress, type Hex } from "viem";
import { type AppDatabase, createDatabase } from "../../db/client";
import {
  chainCursors,
  chainEvents,
  ensMembers,
  ensTrips,
  indexedVaults,
  tripEvents,
} from "../../db/schema";
import { IndexerService } from "./service";
import type { IndexSource, TripEventEnvelope, VaultSnapshot } from "./types";

const vault = getAddress("0x0000000000000000000000000000000000000123");
const alice = getAddress("0x000000000000000000000000000000000000a11c");
const merchant = getAddress("0x000000000000000000000000000000000000cafe");
const factory = getAddress("0x000000000000000000000000000000000000fac7");
const hash = (block: bigint) => `0x${block.toString(16).padStart(64, "0")}` as Hex;
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

function fixture() {
  const db = createDatabase(":memory:");
  databases.push(db);
  let head = 1n;
  let fail = false;
  let corruptHistory = false;
  const member: Member = {
    address: alice,
    displayName: "Alice",
    ensName: null,
    worldLinked: false,
    policy: { autoApproveMax: "0", totalCap: "0" },
    deposited: "100000000",
    spent: "0",
    locked: "0",
    available: "100000000",
  };
  const source: IndexSource = {
    chainId: 5042002,
    factory,
    head: async () => head,
    blockHash: async (block) => (corruptHistory ? hash(999n) : hash(block)),
    created: async (from, to) =>
      from <= 1n && to >= 1n ? [{ vault, creator: alice, createdBlock: 1n }] : [],
    events: async (_vaults, from, to) =>
      from <= head && to >= head
        ? [
            {
              vault,
              blockNumber: head,
              blockHash: hash(head),
              transactionHash: hash(100n + head),
              logIndex: 0,
              name: head === 1n ? "Proposed" : "Locked",
              proposalId: "1",
              args: { proposalId: "1" },
            },
          ]
        : [],
    snapshot: async (_vault, block): Promise<VaultSnapshot> => {
      if (fail) throw new Error("simulated RPC failure");
      return {
        address: vault,
        creator: alice,
        endsAt: "2030-01-02T00:00:00.000Z",
        members: [
          {
            ...member,
            available: block > 1n ? "90000000" : "100000000",
            locked: block > 1n ? "10000000" : "0",
          },
        ],
        proposals: [
          {
            id: "1",
            tripId: vault.toLowerCase(),
            merchant,
            merchantName: merchant,
            title: "Guided walk",
            location: "Mumbai",
            startsAt: "2030-01-01T12:00:00.000Z",
            total: "10000000",
            shares: [
              { member: alice, amount: "10000000", state: block > 1n ? "approved" : "waiting" },
            ],
            status: block > 1n ? "locked" : "pending",
            deadline: "2030-01-01T11:00:00.000Z",
            ticketHash: null,
          },
        ],
      };
    },
  };
  return {
    db,
    source,
    service: new IndexerService(db, source),
    next: () => {
      head += 1n;
    },
    fail: (value: boolean) => {
      fail = value;
    },
    corrupt: () => {
      corruptHistory = true;
    },
  };
}

test("an RPC failure cannot advance the cursor or partially publish a projection", async () => {
  const f = fixture();
  f.fail(true);
  await expect(f.service.sync()).rejects.toThrow("simulated RPC failure");
  expect(f.db.select().from(chainCursors).all()).toHaveLength(0);
  expect(f.db.select().from(chainEvents).all()).toHaveLength(0);
  expect(f.db.select().from(indexedVaults).all()).toHaveLength(0);
  expect(f.db.select().from(tripEvents).all()).toHaveLength(0);
  f.fail(false);
  await f.service.sync();
  expect(f.service.proposals(vault)[0]?.status).toBe("pending");
});

test("restart resumes at the durable cursor without duplicate chain logs or notifications", async () => {
  const f = fixture();
  await Promise.all([f.service.sync(), f.service.sync()]);
  expect(f.db.select().from(chainEvents).all()).toHaveLength(1);
  const initial = f.service.events(vault);
  expect(initial.map((entry) => entry.data.type)).toEqual(["balances.updated", "proposal.created"]);
  const restarted = new IndexerService(f.db, f.source);
  await restarted.sync();
  expect(restarted.events(vault)).toEqual(initial);
  f.next();
  const observed: { event: TripEventEnvelope; cursor: string | undefined }[] = [];
  restarted.bus.subscribe((event) =>
    observed.push({
      event,
      cursor: f.db.select().from(chainCursors).where(eq(chainCursors.id, restarted.cursorId)).get()
        ?.blockNumber,
    }),
  );
  await restarted.sync();
  expect(restarted.proposals(vault)[0]?.status).toBe("locked");
  expect(restarted.proposals(vault)[0]?.txHash).toBe(hash(101n));
  expect(restarted.getTrip(vault).members[0]?.locked).toBe("10000000");
  expect(observed).toHaveLength(2);
  expect(observed.every((entry) => entry.cursor === "2")).toBe(true);
  const after = Number(initial.at(-1)?.id);
  expect(restarted.events(vault, after)).toHaveLength(2);
});

test("changed finalized history fails closed and membership is enforced", async () => {
  const f = fixture();
  await f.service.sync();
  expect(f.service.requireMember(vault, alice).vaultAddress).toBe(vault);
  expect(() => f.service.requireMember(vault, merchant)).toThrow("Join this trip");
  f.corrupt();
  await expect(f.service.sync()).rejects.toThrow("Indexed chain history changed");
  expect(f.service.events(vault)).toHaveLength(2);
});

test("only confirmed ENS names project and survive metadata refresh, new blocks and restart", async () => {
  const f = fixture();
  const tripId = vault.toLowerCase();
  const name = "goa-0123.rickshare.eth";
  await f.service.sync();
  f.db.insert(ensTrips).values({ tripId, name }).run();
  f.db
    .insert(ensMembers)
    .values({
      id: `${tripId}:${alice.toLowerCase()}`,
      tripId,
      address: alice.toLowerCase(),
      label: "alice",
    })
    .run();
  f.service.refreshMetadata(vault);
  expect(f.service.getTrip(vault).ensName).toBeNull();
  expect(f.service.getTrip(vault).members[0]?.ensName).toBeNull();

  f.db.update(ensTrips).set({ registry: factory, resolver: merchant }).run();
  f.service.refreshMetadata(vault);
  expect(f.service.getTrip(vault).ensName).toBe(name);
  expect(f.service.getTrip(vault).members[0]?.ensName).toBeNull();
  f.db.update(ensMembers).set({ ready: true }).run();
  f.service.refreshMetadata(vault);
  const event = f.service.events(vault).at(-1)?.data;
  expect(event?.type === "balances.updated" && event.members[0]?.ensName).toBe(`alice.${name}`);
  expect(f.service.getTrip(vault).members[0]?.available).toBe("100000000");

  f.next();
  await f.service.sync();
  const restarted = new IndexerService(f.db, f.source);
  expect(restarted.getTrip(vault).ensName).toBe(name);
  expect(restarted.getTrip(vault).members[0]?.ensName).toBe(`alice.${name}`);
  expect(restarted.getTrip(vault).members[0]?.available).toBe("90000000");
});
