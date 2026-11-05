import { expect, test } from "bun:test";
import { createDatabase } from "../../db/client";
import { createChatStore } from "./service";

const member = "0x0000000000000000000000000000000000000001";

test("lists the most recent messages of one trip, oldest first", () => {
  const fixedNow = new Date("2026-12-14T10:00:00.000Z");
  const chat = createChatStore(createDatabase(":memory:"), () => fixedNow);
  for (const text of ["one", "two", "three"]) {
    chat.append({ tripId: "india26", role: "member", author: member, text, proposalIds: [] });
  }
  chat.append({
    tripId: "other",
    role: "member",
    author: member,
    text: "elsewhere",
    proposalIds: [],
  });

  // Same timestamp for all rows: UUIDv7 ids still keep insertion order.
  expect(chat.listRecent("india26", 2).map((message) => message.text)).toEqual(["two", "three"]);
});

test("collects the proposal ids the agent announced in one trip", () => {
  const chat = createChatStore(createDatabase(":memory:"));
  chat.append({ tripId: "india26", role: "agent", author: null, text: "a", proposalIds: ["1"] });
  chat.append({ tripId: "india26", role: "member", author: member, text: "b", proposalIds: ["x"] });
  chat.append({
    tripId: "india26",
    role: "agent",
    author: null,
    text: "c",
    proposalIds: ["2", "3"],
  });
  chat.append({ tripId: "other", role: "agent", author: null, text: "d", proposalIds: ["9"] });
  expect(chat.agentProposalIds("india26")).toEqual(["1", "2", "3"]);
});

test("returns stored messages in the shared ChatMessage shape", () => {
  const chat = createChatStore(createDatabase(":memory:"));
  const saved = chat.append({
    tripId: "india26",
    role: "agent",
    author: null,
    text: "Here is a ferry option.",
    proposalIds: ["7"],
  });
  expect(saved).toMatchObject({ role: "agent", author: null, proposalIds: ["7"] });
  expect(chat.listRecent("india26", 10)).toEqual([saved]);
});
