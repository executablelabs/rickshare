import type { ChatMessage, Proposal } from "@rickshare/shared";
import { tripVaultAbi } from "@rickshare/shared/abi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { decodeFunctionData } from "viem";
import { expect, test, vi } from "vitest";
import {
  applyTripEvent,
  approveCall,
  mergeMessages,
  planKeys,
  upsertProposal,
  useTripStream,
} from "./plan";

const message = (id: string, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  tripId: "t",
  role: "member",
  author: `0x${"1".repeat(40)}`,
  text: id,
  proposalIds: [],
  createdAt,
  ...extra,
});
const proposal = (id: string, status: Proposal["status"] = "pending"): Proposal => ({
  id,
  tripId: "t",
  merchant: `0x${"d".repeat(40)}`,
  merchantName: "Goa Adventures",
  title: `Proposal ${id}`,
  location: "Goa",
  startsAt: "2026-12-12T04:30:00.000Z",
  total: "1",
  shares: [],
  status,
  deadline: "2026-12-11T00:00:00.000Z",
  ticketHash: null,
  txHash: "0x00",
});

test("replaces the optimistic copy once the saved message arrives, keeping time order", () => {
  const pending = message("pending:r1", "2026-12-01T10:00:02Z", { clientRequestId: "r1" });
  const earlier = message("m0", "2026-12-01T10:00:00Z");
  const saved = message("m1", "2026-12-01T10:00:01Z", { clientRequestId: "r1" });
  const reply = message("m2", "2026-12-01T10:00:03Z", { clientRequestId: "r1", role: "agent" });

  expect(mergeMessages([earlier, pending], [saved, reply]).map((m) => m.id)).toEqual([
    "m0",
    "m1",
    "m2",
  ]);
});

test("does not duplicate a message delivered twice by response and stream", () => {
  const saved = message("m1", "2026-12-01T10:00:01Z");
  expect(mergeMessages([saved], [saved])).toHaveLength(1);
});

test("malformed stream frames refetch authoritative data and disconnects release the source", () => {
  const listeners = new Map<string, (frame: MessageEvent<string>) => void>();
  const close = vi.fn();
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener(type: string, listener: (frame: MessageEvent<string>) => void) {
        listeners.set(type, listener);
      }
      close = close;
    },
  );
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const hook = renderHook(() => useTripStream("t"), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  try {
    act(() => {
      listeners.get("chat.message")?.(new MessageEvent("chat.message", { data: "{" }));
      listeners.get("chat.message")?.(new MessageEvent("chat.message", { data: "{}" }));
    });
    expect(invalidate).toHaveBeenCalledTimes(4);
    hook.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("upserts proposals in id order", () => {
  const updated = upsertProposal([proposal("2"), proposal("10")], proposal("2", "locked"));
  expect(updated.map((p) => [p.id, p.status])).toEqual([
    ["2", "locked"],
    ["10", "pending"],
  ]);
});

test("applies stream events to the cached feed", () => {
  const client = new QueryClient();
  applyTripEvent(client, "t", {
    type: "chat.message",
    message: message("m1", "2026-12-01T10:00:00Z"),
  });
  applyTripEvent(client, "t", { type: "proposal.created", proposal: proposal("1") });
  applyTripEvent(client, "t", { type: "proposal.updated", proposal: proposal("1", "fulfilled") });
  expect(client.getQueryData<ChatMessage[]>(planKeys.chat("t"))?.map((m) => m.id)).toEqual(["m1"]);
  expect(client.getQueryData<Proposal[]>(planKeys.proposals("t"))).toEqual([
    proposal("1", "fulfilled"),
  ]);
});

test("encodes the vault approve call from the World attestation", () => {
  const vault = `0x${"4".repeat(40)}`;
  const deadline = String(Math.floor(Date.now() / 1000) + 120);
  const call = approveCall(
    vault,
    {
      vaultAddress: vault,
      proposalId: "7",
      member: `0x${"1".repeat(40)}`,
      amount: "42000000",
      nonce: "3",
      deadline,
      chainId: 5042002,
      signature: `0x${"ab".repeat(65)}`,
    },
    {
      proposalId: "7",
      member: `0x${"1".repeat(40)}`,
      amount: "42000000",
      deadline: new Date(Date.now() + 600000).toISOString(),
    },
  );
  expect(call.to.toLowerCase()).toBe(vault);
  expect(call.from.toLowerCase()).toBe(`0x${"1".repeat(40)}`);
  expect(decodeFunctionData({ abi: tripVaultAbi, data: call.data })).toEqual({
    functionName: "approve",
    args: [7n, 3n, BigInt(deadline), `0x${"ab".repeat(65)}`],
  });
});

test.each([
  { chainId: 1 },
  { proposalId: "8" },
  { amount: "1" },
  { member: `0x${"2".repeat(40)}` },
  { vaultAddress: `0x${"5".repeat(40)}` },
  { deadline: "0" },
  { deadline: String(Math.floor(Date.now() / 1000) + 901) },
  { deadline: String(Math.floor(Date.now() / 1000) + 700) },
  { signature: "0x12" },
])("refuses an attestation that differs from the displayed share: %j", (changed) => {
  const vault = `0x${"4".repeat(40)}`;
  const member = `0x${"1".repeat(40)}`;
  const attestation = {
    vaultAddress: vault,
    proposalId: "7",
    member,
    amount: "42000000",
    nonce: "3",
    deadline: String(Math.floor(Date.now() / 1000) + 120),
    chainId: 5042002,
    signature: `0x${"ab".repeat(65)}`,
    ...changed,
  };
  expect(() =>
    approveCall(vault, attestation, {
      proposalId: "7",
      member,
      amount: "42000000",
      deadline: new Date(Date.now() + 600000).toISOString(),
    }),
  ).toThrow();
});
