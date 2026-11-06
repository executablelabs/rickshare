import type { Proposal } from "@rickshare/shared";
import { expect, test } from "vitest";
import { ticketStatus } from "./ProposalTicket";

const angie = "0x00000000000000000000000000000000000000A1";
const gitau = "0x00000000000000000000000000000000000000c3";
const base: Proposal = {
  id: "1",
  tripId: "t",
  merchant: `0x${"d".repeat(40)}`,
  merchantName: "Goa Adventures",
  title: "Paragliding",
  location: "Arambol",
  startsAt: "2026-12-12T04:30:00.000Z",
  total: "84000000",
  shares: [
    { member: angie, amount: "42000000", state: "approved" },
    { member: gitau, amount: "42000000", state: "waiting" },
  ],
  status: "pending",
  deadline: "2026-12-11T00:00:00.000Z",
  ticketHash: null,
  txHash: "0x00",
};

test.each([
  [
    "a waiting participant in any casing",
    base,
    "0x00000000000000000000000000000000000000C3",
    "Waiting for you",
    "action",
  ],
  ["a participant who approved", base, angie.toLowerCase(), "Waiting on others", "waiting"],
  ["someone outside the purchase", base, `0x${"9".repeat(40)}`, "Not for you", "neutral"],
  ["anyone once locked", { ...base, status: "locked" as const }, gitau, "Everyone's in", "stamp"],
  [
    "anyone once the ticket is issued",
    { ...base, status: "fulfilled" as const },
    gitau,
    "Ticket ready",
    "stamp",
  ],
  ["anyone once declined", { ...base, status: "rejected" as const }, angie, "Declined", "declined"],
  ["anyone once refunded", { ...base, status: "refunded" as const }, angie, "Refunded", "neutral"],
])("labels the ticket for %s", (_case, proposal, viewer, label, tone) => {
  expect(ticketStatus(proposal, viewer)).toMatchObject({ label, tone });
});
