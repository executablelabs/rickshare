import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { arcTestnet, inviteTypedData, type WalletTransaction } from "@rickshare/shared";
import { getAddress, type Hex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type AppDatabase, createDatabase } from "../../db/client";
import { tripInvites } from "../../db/schema";
import { IndexerService } from "../indexer/service";
import type { IndexSource } from "../indexer/types";
import type { TripChain } from "./chain";
import { TripService } from "./service";

const alice = privateKeyToAccount(`0x${"01".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"02".repeat(32)}`);
const carol = privateKeyToAccount(`0x${"03".repeat(32)}`);
const vault = getAddress("0x0000000000000000000000000000000000000123");
const hash: Hex = `0x${"ab".repeat(32)}`;
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

function fixture() {
  let now = Date.now();
  const endsAt = BigInt(Math.floor(now / 1000) + 86400);
  const db = createDatabase(":memory:");
  databases.push(db);
  const members = new Set([alice.address]);
  const tx = (from: typeof alice.address): WalletTransaction => ({
    chainId: 5042002,
    from,
    to: vault,
    data: "0x1234",
    value: "0x0",
    maxFeePerGas: "0x9502f9000",
    maxPriorityFeePerGas: "0x3b9aca00",
  });
  const chain: TripChain = {
    info: async (_vault, member) => ({
      creator: alice.address,
      endsAt,
      isMember: members.has(member),
      memberCount: members.size,
    }),
    prepareCreate: async (actor) => tx(actor),
    confirmCreate: async () => vault,
    verifyInvite: async (_vault, member, deadline, signature) =>
      verifyTypedData({
        address: alice.address,
        ...inviteTypedData({ chainId: arcTestnet.id, vaultAddress: vault, member, deadline }),
        signature,
      }),
    prepareJoin: async (_vault, member) => tx(member),
    confirmJoin: async (_vault, member) => {
      members.add(member);
    },
  };
  const source: IndexSource = {
    chainId: 5042002,
    factory: vault,
    head: async () => 0n,
    blockHash: async () => hash,
    created: async () => [],
    events: async () => [],
    snapshot: async () => {
      throw new Error("No snapshots in this fixture");
    },
  };
  const indexer = new IndexerService(db, source);
  const service = new TripService(db, chain, indexer, {
    origin: "http://localhost:5173",
    digest: (token) => createHash("sha256").update(token).digest("hex"),
    now: () => now,
  });
  return {
    db,
    service,
    members,
    endsAt,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function token(url: string) {
  const value = new URL(url).pathname.split("/").at(-1);
  if (!value) throw new Error("No invitation token");
  return value;
}

test("invite tokens are stored hashed and can be claimed by only one recipient", async () => {
  const f = fixture();
  const invite = await f.service.createInvite(alice.address, vault);
  const opaque = token(invite.url);
  expect(f.db.select().from(tripInvites).get()?.tokenHash).not.toContain(opaque);
  const claims = await Promise.allSettled([
    f.service.claim(bob.address, opaque),
    f.service.claim(carol.address, opaque),
  ]);
  expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(claims.filter((result) => result.status === "rejected")).toHaveLength(1);
  const owner = f.db.select().from(tripInvites).get()?.claimedBy;
  if (!owner) throw new Error("No claimed wallet");
  expect((await f.service.claim(getAddress(owner), opaque)).inviteId).toBe(invite.inviteId);
});

test("creator signatures authorize only the claimed wallet and membership is confirmed separately", async () => {
  const f = fixture();
  const invite = await f.service.createInvite(alice.address, vault);
  await f.service.claim(bob.address, token(invite.url));
  await expect(f.service.authorize(bob.address, vault, invite.inviteId)).rejects.toThrow(
    "Only the trip creator",
  );
  const request = await f.service.authorize(alice.address, vault, invite.inviteId);
  const deadline = request.typedData?.message.deadline;
  if (!deadline) throw new Error("No invitation deadline");
  const data = inviteTypedData({
    chainId: 5042002,
    vaultAddress: vault,
    member: bob.address,
    deadline: BigInt(deadline),
  });
  await expect(
    f.service.authorize(alice.address, vault, invite.inviteId, await bob.signTypedData(data)),
  ).rejects.toThrow("could not be verified");
  await f.service.authorize(alice.address, vault, invite.inviteId, await alice.signTypedData(data));
  expect((await f.service.invite(bob.address, invite.inviteId)).transaction?.from).toBe(
    bob.address,
  );
  await expect(f.service.invite(carol.address, invite.inviteId)).rejects.toThrow(
    "not found for your wallet",
  );
  await f.service.confirmJoin(bob.address, invite.inviteId, hash);
  expect((await f.service.invite(bob.address, invite.inviteId)).status).toBe("joined");
  expect(f.members.has(bob.address)).toBe(true);
});

test("lost join confirmations recover from actual membership without another transaction", async () => {
  const f = fixture();
  const invite = await f.service.createInvite(alice.address, vault);
  await f.service.claim(bob.address, token(invite.url));
  f.members.add(bob.address);
  const recovered = await f.service.invite(bob.address, invite.inviteId);
  expect(recovered.status).toBe("joined");
  expect(recovered.transaction).toBeNull();
});

test("non-creators cannot issue links and expired or already-member claims are rejected", async () => {
  const f = fixture();
  await expect(f.service.createInvite(bob.address, vault)).rejects.toThrow("Only the trip creator");
  const invite = await f.service.createInvite(
    alice.address,
    vault,
    new Date(Date.now() + 1000).toISOString(),
  );
  await expect(f.service.claim(alice.address, token(invite.url))).rejects.toThrow("already belong");
  f.advance(2000);
  await expect(f.service.claim(bob.address, token(invite.url))).rejects.toThrow("new invitation");
  await expect(
    f.service.prepare(alice.address, {
      name: "Past trip",
      endsAt: new Date(Date.now() - 1000).toISOString(),
    }),
  ).rejects.toThrow("future trip end");
});
