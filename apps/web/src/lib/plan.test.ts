import type { ChatMessage, Proposal } from "@rickshare/shared";
import { tripVaultAbi } from "@rickshare/shared/abi";
import { QueryClient } from "@tanstack/react-query";
import { decodeFunctionData } from "viem";
import { expect, test } from "vitest";
import { applyTripEvent, approveCall, mergeMessages, planKeys, upsertProposal } from "./plan";

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
  const call = approveCall(vault, {
    vaultAddress: vault,
    proposalId: "7",
    member: `0x${"1".repeat(40)}`,
    amount: "42000000",
    nonce: "3",
    deadline: "1999999999",
    chainId: 5042002,
    signature: `0x${"ab".repeat(65)}`,
  });
  expect(call.to.toLowerCase()).toBe(vault);
  expect(decodeFunctionData({ abi: tripVaultAbi, data: call.data })).toEqual({
    functionName: "approve",
    args: [7n, 3n, 1999999999n, `0x${"ab".repeat(65)}`],
  });
});
