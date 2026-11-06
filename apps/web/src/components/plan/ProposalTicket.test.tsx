import type { Proposal } from "@rickshare/shared";
import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ProposalTicket, ticketStatus } from "./ProposalTicket";

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
  deadline: new Date(Date.now() + 86400000).toISOString(),
  ticketHash: null,
  txHash: "0x00",
};

test("an expired pending share cannot keep asking its member to approve", () => {
  expect(ticketStatus({ ...base, deadline: "2020-01-01T00:00:00.000Z" }, gitau)).toMatchObject({
    label: "Expired",
    tone: "neutral",
  });
});

test("removes approval actions when a pending ticket expires while open", () => {
  vi.useFakeTimers();
  try {
    render(
      <ProposalTicket
        proposal={{ ...base, deadline: new Date(Date.now() + 1000).toISOString() }}
        members={[]}
        viewer={gitau}
        actions={<button type="button">Approve my share</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Approve my share" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve my share" })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("uses the current clock when a stream update replaces the proposal deadline", () => {
  vi.useFakeTimers();
  try {
    const ticket = (deadline: number) => (
      <ProposalTicket
        proposal={{ ...base, deadline: new Date(deadline).toISOString() }}
        members={[]}
        viewer={gitau}
        actions={<button type="button">Approve my share</button>}
      />
    );
    const view = render(ticket(Date.now() + 60000));
    act(() => vi.advanceTimersByTime(10000));
    view.rerender(ticket(Date.now() + 1000));
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve my share" })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

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
