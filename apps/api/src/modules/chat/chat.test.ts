import { afterEach, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Trip } from "@rickshare/shared";
import { getAddress, type Hex, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../../app";
import { type AppDatabase, createDatabase } from "../../db/client";
import {
  chatMessages,
  chatRequests,
  indexedVaults,
  itineraryItems,
  tripEvents,
} from "../../db/schema";
import { createRuntime } from "../../runtime";
import type { AgentModel } from "../agent/service";
import { AuthService } from "../auth/service";
import { IndexerService } from "../indexer/service";
import type { IndexSource } from "../indexer/types";
import { createItineraryStore } from "../trips/itinerary";
import { ChatCoordinator } from "./coordinator";
import { createChatStore } from "./service";

const alice = privateKeyToAccount(`0x${"01".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"02".repeat(32)}`);
const vault = getAddress("0x0000000000000000000000000000000000000123");
const hash: Hex = `0x${"ab".repeat(32)}`;
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

async function fixture() {
  const db = createDatabase(":memory:");
  databases.push(db);
  const auth = new AuthService(db, {
    origin: "http://localhost:5173",
    secret: "test-stream-session-secret-at-least-32-characters",
    nonceTtlSeconds: 300,
    sessionTtlSeconds: 3600,
    verifySignature: verifyMessage,
  });
  const source: IndexSource = {
    chainId: 5042002,
    factory: vault,
    head: async () => 0n,
    blockHash: async () => hash,
    created: async () => [],
    events: async () => [],
    snapshot: async () => {
      throw new Error("No snapshot expected");
    },
  };
  const indexer = new IndexerService(db, source);
  const member = (address: string) => ({
    address,
    displayName: "Trip member",
    ensName: null,
    worldLinked: false,
    policy: { autoApproveMax: "0", totalCap: "0" },
    deposited: "0",
    spent: "0",
    locked: "0",
    available: "0",
  });
  const trip: Trip = {
    id: vault.toLowerCase(),
    name: "India 26",
    ensName: null,
    vaultAddress: vault,
    endsAt: "2030-01-01T00:00:00.000Z",
    members: [member(alice.address)],
  };
  db.insert(indexedVaults)
    .values({
      address: vault.toLowerCase(),
      scope: indexer.cursorId,
      creator: alice.address.toLowerCase(),
      createdBlock: "0",
      payload: JSON.stringify(trip),
    })
    .run();
  let calls = 0;
  const model: AgentModel = {
    createMessage: async () => {
      calls += 1;
      await Bun.sleep(5);
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Tell me which day you want to go.", citations: null }],
      };
    },
  };
  const runtime = createRuntime({ db, auth, indexer, model });
  const app = createApp({ runtime, streamHeartbeatMs: 10 });
  const login = async (account: typeof alice) => {
    const challenge = auth.issueNonce();
    const message = createSiweMessage({
      address: account.address,
      chainId: 5042002,
      domain: "localhost:5173",
      uri: "http://localhost:5173",
      version: "1",
      nonce: challenge.nonce,
      issuedAt: new Date(),
    });
    return auth.verify(message, await account.signMessage({ message }), challenge.browserToken);
  };
  const logged = await login(alice);
  const headers = {
    Origin: "http://localhost:5173",
    "content-type": "application/json",
    Cookie: `rickshare_session=${logged.token}`,
  };
  return {
    db,
    auth,
    indexer,
    app,
    runtime,
    headers,
    token: logged.token,
    login,
    calls: () => calls,
    addMember: (address: string) => {
      trip.members.push(member(address));
      db.update(indexedVaults)
        .set({ payload: JSON.stringify(trip) })
        .run();
    },
  };
}

async function frames(reader: ReadableStreamDefaultReader<Uint8Array>, count: number) {
  const decoder = new TextDecoder();
  let text = "";
  const read = async () => {
    while (text.split("\n\n").filter((frame) => frame.includes("data:")).length < count) {
      const next = await reader.read();
      if (next.done) break;
      text += decoder.decode(next.value, { stream: true });
    }
    return text.split("\n\n").filter((frame) => frame.includes("data:"));
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Stream read timed out")), 1000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("chat requests are idempotent and preserve the authenticated sender and client request ID", async () => {
  const f = await fixture();
  const input = { requestId: randomUUID(), text: "Ideas for Mumbai?" };
  const post = () =>
    f.app.request(`/trips/${vault}/chat`, {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify(input),
    });
  const [first, duplicate] = await Promise.all([post(), post()]);
  expect([first.status, duplicate.status].sort()).toEqual([200, 202]);
  expect((await post()).status).toBe(200);
  expect(f.calls()).toBe(1);
  const messages = f.runtime.chat().listRecent(vault.toLowerCase(), 10);
  expect(messages).toHaveLength(2);
  expect(messages[0]?.author).toBe(alice.address);
  expect(messages.every((message) => message.clientRequestId === input.requestId)).toBe(true);
  expect(f.indexer.events(vault).map((event) => event.data.type)).toEqual([
    "chat.message",
    "chat.message",
  ]);
  const spoofed = await f.app.request(`/trips/${vault}/chat`, {
    method: "POST",
    headers: f.headers,
    body: JSON.stringify({ ...input, requestId: randomUUID(), author: bob.address }),
  });
  expect(spoofed.status).toBe(400);
});

test("streams replay only after Last-Event-ID and clean up subscriptions on disconnect", async () => {
  const f = await fixture();
  f.runtime.chat().append({
    tripId: vault.toLowerCase(),
    role: "member",
    author: alice.address,
    text: "First",
    proposalIds: [],
  });
  f.runtime.chat().append({
    tripId: vault.toLowerCase(),
    role: "agent",
    author: null,
    text: "Second",
    proposalIds: [],
  });
  let active = 0;
  const original = f.indexer.bus.subscribe.bind(f.indexer.bus);
  const subscribe = spyOn(f.indexer.bus, "subscribe").mockImplementation((listener) => {
    active += 1;
    let open = true;
    const stop = original(listener);
    return () => {
      if (open) {
        open = false;
        active -= 1;
        stop();
      }
    };
  });
  try {
    const response = await f.app.request(`/trips/${vault}/stream`, {
      headers: { ...f.headers, "Last-Event-ID": "1" },
    });
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No stream body");
    const received = await frames(reader, 1);
    expect(received[0]).toContain("id: 2");
    expect(received[0]).toContain('"text":"Second"');
    await reader.cancel();
    await Bun.sleep(1);
    expect(active).toBe(0);
  } finally {
    subscribe.mockRestore();
  }
});

test("events committed during subscription are replayed without missing the initial race", async () => {
  const f = await fixture();
  const original = f.indexer.bus.subscribe.bind(f.indexer.bus);
  const subscribe = spyOn(f.indexer.bus, "subscribe").mockImplementation((listener) => {
    const stop = original(listener);
    f.runtime.chat().append({
      tripId: vault.toLowerCase(),
      role: "agent",
      author: null,
      text: "Committed during subscribe",
      proposalIds: [],
    });
    return stop;
  });
  try {
    const response = await f.app.request(`/trips/${vault}/stream`, { headers: f.headers });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No stream body");
    expect((await frames(reader, 1))[0]).toContain("Committed during subscribe");
    await reader.cancel();
  } finally {
    subscribe.mockRestore();
  }
});

test("revoked sessions stop a live stream before sending a new event", async () => {
  const f = await fixture();
  const response = await f.app.request(`/trips/${vault}/stream`, { headers: f.headers });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No stream body");
  f.auth.logout(f.token);
  f.runtime.chat().append({
    tripId: vault.toLowerCase(),
    role: "agent",
    author: null,
    text: "Private update after logout",
    proposalIds: [],
  });
  const next = await Promise.race([
    reader.read(),
    Bun.sleep(1000).then(() => {
      throw new Error("Revoked stream stayed open");
    }),
  ]);
  expect(next.done).toBe(true);
});

test("non-members and malformed stream cursors are rejected before opening a stream", async () => {
  const f = await fixture();
  const outsider = await f.login(bob);
  expect(
    (
      await f.app.request(`/trips/${vault}/stream`, {
        headers: { Cookie: `rickshare_session=${outsider.token}` },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.app.request(`/trips/${vault}/stream`, {
        headers: { ...f.headers, "Last-Event-ID": "-1" },
      })
    ).status,
  ).toBe(400);
});

test("durable replay orders events even when wakeup notifications arrive out of order", async () => {
  const f = await fixture();
  const response = await f.app.request(`/trips/${vault}/stream`, { headers: f.headers });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No stream body");
  const silent = createChatStore(f.db);
  silent.append({
    tripId: vault.toLowerCase(),
    role: "agent",
    author: null,
    text: "Earlier",
    proposalIds: [],
  });
  silent.append({
    tripId: vault.toLowerCase(),
    role: "agent",
    author: null,
    text: "Later",
    proposalIds: [],
  });
  const [earlier, later] = f.indexer.events(vault);
  if (!earlier || !later) throw new Error("No persisted events");
  f.indexer.bus.publish(later);
  f.indexer.bus.publish(earlier);
  const received = await frames(reader, 2);
  expect(received[0]).toContain("Earlier");
  expect(received[1]).toContain("Later");
  await reader.cancel();
});

test("another member cannot reuse a client request ID to impersonate its sender", async () => {
  const f = await fixture();
  const input = { requestId: randomUUID(), text: "First member question" };
  expect(
    (
      await f.app.request(`/trips/${vault}/chat`, {
        method: "POST",
        headers: f.headers,
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(200);
  f.addMember(bob.address);
  const other = await f.login(bob);
  const response = await f.app.request(`/trips/${vault}/chat`, {
    method: "POST",
    headers: { ...f.headers, Cookie: `rickshare_session=${other.token}` },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(403);
  expect(f.calls()).toBe(1);
});

test("chat rows and their outbox records roll back together on invalid internal data", async () => {
  const f = await fixture();
  expect(() =>
    f.runtime.chat().append({
      tripId: vault.toLowerCase(),
      role: "member",
      author: "not-an-address",
      text: "Invalid sender",
      proposalIds: [],
    }),
  ).toThrow();
  expect(f.db.select().from(chatMessages).all()).toEqual([]);
  expect(f.db.select().from(tripEvents).all()).toEqual([]);
});

test("group itinerary notifications never expose ticket bearer URLs", async () => {
  const f = await fixture();
  f.db
    .insert(itineraryItems)
    .values({
      id: "paid-item",
      tripId: vault.toLowerCase(),
      startsAt: "2030-01-01T12:00:00.000Z",
      title: "Paid walk",
      location: "Mumbai",
      proposalId: "1",
      ticketUrls: ["https://merchant.example/tickets/private-token"],
    })
    .run();
  const itinerary = createItineraryStore(f.db, (event) => f.indexer.bus.publish(event));
  const saved = itinerary.replace(vault.toLowerCase(), []);
  expect(saved[0]?.ticketUrls).toEqual(["https://merchant.example/tickets/private-token"]);
  expect(JSON.stringify(f.indexer.events(vault))).not.toContain("private-token");
});

test("restarting a coordinator does not rerun an interrupted purchase-capable turn", async () => {
  const f = await fixture();
  const requestId = randomUUID();
  const tripId = vault.toLowerCase();
  f.db
    .insert(chatRequests)
    .values({
      id: `${tripId}:${requestId}`,
      tripId,
      actor: alice.address.toLowerCase(),
      requestId,
      text: "Previous request",
      status: "processing",
      runId: "previous-process",
    })
    .run();
  const restarted = new ChatCoordinator(f.db, f.runtime.agent());
  expect(
    await restarted.post(tripId, alice.address, { requestId, text: "Previous request" }),
  ).toMatchObject({ status: "interrupted", reply: null, errorCode: "AGENT_TURN_INTERRUPTED" });
  expect(f.calls()).toBe(0);
});
