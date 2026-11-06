import type { ChatMessage, Proposal } from "@rickshare/shared";
import { tripVaultAbi } from "@rickshare/shared/abi";
import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { decodeFunctionData, type Hex } from "viem";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi, tripFixture, tripRoutes } from "../../test/api";

const me = "0x1111111111111111111111111111111111111111";
const bashy = `0x${"2".repeat(40)}`;
const tripId = "0x3fa2000000000000000000000000000000000001";
const vault = `0x${"3".repeat(40)}`;
const hash = `0x${"ab".repeat(32)}` as const;
const sendTransaction = vi.fn(async (_call: { to: string; data: Hex }) => hash);

const proposal: Proposal = {
  id: "7",
  tripId,
  merchant: `0x${"d".repeat(40)}`,
  merchantName: "Goa Adventures",
  title: "Tandem paragliding, Arambol",
  location: "Arambol beach",
  startsAt: "2026-12-12T04:30:00.000Z",
  total: "84000000",
  shares: [
    { member: me, amount: "42000000", state: "waiting" },
    { member: bashy, amount: "42000000", state: "approved" },
  ],
  status: "pending",
  deadline: new Date(Date.now() + 86400000).toISOString(),
  ticketHash: null,
  txHash: "0x00",
};
const agentMessage: ChatMessage = {
  id: "m2",
  tripId,
  role: "agent",
  author: null,
  text: "Paragliding fits Saturday morning.",
  proposalIds: ["7"],
  createdAt: "2026-12-01T10:00:01.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  sendTransaction.mockClear();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});
afterEach(() => vi.useRealTimers());

function linkedTrip() {
  const trip = tripFixture(tripId, me, { vaultAddress: vault });
  trip.members = trip.members.map((member) => ({
    ...member,
    worldLinked: true,
    deposited: "100000000",
    available: "100000000",
    policy: { autoApproveMax: "1", totalCap: "1" },
  }));
  return trip;
}

async function renderPlan() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/trips/${tripId}/plan`] }),
  );
  await router.load();
  render(
    <WalletContext.Provider
      value={{
        configured: true,
        ready: true,
        authenticated: true,
        address: me,
        login: vi.fn(),
        logout: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        sendTransaction,
      }}
    >
      <AppProviders router={router} />
    </WalletContext.Provider>,
  );
}

test("an empty plan offers ideas, and a sent message shows the planner's reply", async () => {
  let requestId = "";
  const calls = stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`POST /trips/${tripId}/chat`]: (body) => {
      requestId = (body as { requestId: string }).requestId;
      return {
        body: {
          requestId,
          status: "complete",
          errorCode: null,
          reply: {
            memberMessage: {
              id: "m1",
              clientRequestId: requestId,
              tripId,
              role: "member",
              author: me,
              text: "Two days in Goa under $100 each",
              proposalIds: [],
              createdAt: "2026-12-01T10:00:00.000Z",
            },
            agentMessage: { ...agentMessage, clientRequestId: requestId, proposalIds: [] },
          },
        },
      };
    },
  });
  await renderPlan();

  fireEvent.click(await screen.findByRole("button", { name: "Two days in Goa under $100 each" }));
  expect(screen.getByRole("textbox", { name: "Ask for ideas" })).toHaveValue(
    "Two days in Goa under $100 each",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(await screen.findByText("Paragliding fits Saturday morning.")).toBeInTheDocument();
  expect(screen.getAllByText("Two days in Goa under $100 each")).toHaveLength(1);
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(calls.find((call) => call.route === `POST /trips/${tripId}/chat`)?.body).toEqual({
    requestId,
    text: "Two days in Goa under $100 each",
  });
});

test("a failed send puts the text back and explains why", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`POST /trips/${tripId}/chat`]: () => ({
      status: 503,
      body: {
        error: { code: "AGENT_UNAVAILABLE", message: "The trip agent is unavailable right now." },
      },
    }),
  });
  await renderPlan();
  const box = await screen.findByRole("textbox", { name: "Ask for ideas" });
  fireEvent.change(box, { target: { value: "Dinner ideas" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(await screen.findByText("The trip agent is unavailable right now.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Ask for ideas" })).toHaveValue("Dinner ideas");
  expect(screen.queryByRole("list", { name: "Messages" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(calls.filter((call) => call.route === `POST /trips/${tripId}/chat`)).toHaveLength(2),
  );
  const sends = calls.filter((call) => call.route === `POST /trips/${tripId}/chat`);
  expect(sends[0]?.body).toEqual(sends[1]?.body);
});

test("a stopped planner request restores the draft and allows editing a new request", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`POST /trips/${tripId}/chat`]: (body) => ({
      body: {
        requestId: (body as { requestId: string }).requestId,
        status: "failed",
        errorCode: "AGENT_UNAVAILABLE",
        reply: null,
      },
    }),
  });
  await renderPlan();
  const box = await screen.findByRole("textbox", { name: "Ask for ideas" });
  fireEvent.change(box, { target: { value: "Dinner ideas" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(/That request stopped/)).toBeInTheDocument();
  expect(box).toHaveValue("Dinner ideas");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  fireEvent.change(box, { target: { value: "Lunch ideas" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(calls.filter((call) => call.route === `POST /trips/${tripId}/chat`)).toHaveLength(2),
  );
  const sends = calls.filter((call) => call.route === `POST /trips/${tripId}/chat`);
  expect(sends[0]?.body).not.toEqual(sends[1]?.body);
});

test("a streamed reply completes a request even when its HTTP response fails", async () => {
  const listeners = new Map<string, (frame: MessageEvent<string>) => void>();
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener(type: string, listener: (frame: MessageEvent<string>) => void) {
        listeners.set(type, listener);
      }
      close() {}
    },
  );
  try {
    stubApi({
      ...tripRoutes(tripId, me, linkedTrip()),
      [`POST /trips/${tripId}/chat`]: (body) => {
        const clientRequestId = (body as { requestId: string }).requestId;
        listeners.get("chat.message")?.(
          new MessageEvent("chat.message", {
            data: JSON.stringify({
              type: "chat.message",
              message: { ...agentMessage, clientRequestId, proposalIds: [] },
            }),
          }),
        );
        return {
          status: 503,
          body: { error: { code: "UNAVAILABLE", message: "Response interrupted" } },
        };
      },
    });
    await renderPlan();
    const box = await screen.findByRole("textbox", { name: "Ask for ideas" });
    fireEvent.change(box, { target: { value: "Dinner ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Paragliding fits Saturday morning.")).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue(""));
    expect(screen.queryByText("Response interrupted")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a ticket waiting for you can be declined with the prepared reject", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`GET /trips/${tripId}/chat`]: () => ({ body: { messages: [agentMessage] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({ body: { proposals: [proposal] } }),
    [`POST /trips/${tripId}/actions`]: () => ({
      body: {
        action: "reject",
        transactions: [
          {
            chainId: 5042002,
            from: me,
            to: vault,
            data: "0x12",
            value: "0x0",
            maxFeePerGas: "0x1",
            maxPriorityFeePerGas: "0x1",
          },
        ],
      },
    }),
  });
  await renderPlan();
  const ticket = await screen.findByRole("article", { name: "Tandem paragliding, Arambol" });
  expect(within(ticket).getByText("Waiting for you")).toBeInTheDocument();
  fireEvent.click(within(ticket).getByRole("button", { name: "Not for me" }));
  expect(await screen.findByText("Marked not for you")).toBeInTheDocument();
  expect(calls.find((call) => call.route === `POST /trips/${tripId}/actions`)?.body).toEqual({
    action: "reject",
    proposalId: "7",
  });
});

test("approving verifies with World, then sends the vault approve from the member's wallet", async () => {
  const deadline = String(Math.floor(Date.now() / 1000) + 120);
  const popup = { closed: false, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const calls = stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`GET /trips/${tripId}/chat`]: () => ({ body: { messages: [agentMessage] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({ body: { proposals: [proposal] } }),
    [`POST /trips/${tripId}/proposals/7/approval/start`]: () => ({
      body: { requestId: "r1", authorizationUrl: "https://id.worldcoin.org/authorize?x=1" },
    }),
    "GET /world/requests/r1": () => ({
      body: {
        status: "verified",
        errorCode: null,
        attestation: {
          vaultAddress: vault,
          proposalId: "7",
          member: me,
          amount: "42000000",
          nonce: "3",
          deadline,
          chainId: 5042002,
          signature: `0x${"cd".repeat(65)}`,
        },
      },
    }),
  });
  await renderPlan();
  const ticket = await screen.findByRole("article", { name: "Tandem paragliding, Arambol" });
  fireEvent.click(within(ticket).getByRole("button", { name: "Approve my share" }));

  expect(await screen.findByText("Share approved", {}, { timeout: 5000 })).toBeInTheDocument();
  expect(popup.location.href).toBe("https://id.worldcoin.org/authorize?x=1");
  expect(
    calls.some((call) => call.route === `POST /trips/${tripId}/proposals/7/approval/start`),
  ).toBe(true);
  const [sent] = sendTransaction.mock.calls[0] ?? [];
  expect(sent?.to.toLowerCase()).toBe(vault);
  expect(decodeFunctionData({ abi: tripVaultAbi, data: sent?.data ?? "0x" })).toMatchObject({
    functionName: "approve",
    args: [7n, 3n, BigInt(deadline), `0x${"cd".repeat(65)}`],
  });
  await waitFor(() => expect(popup.close).toHaveBeenCalled());
});

test("someone outside a purchase sees it collapsed, with nothing to approve", async () => {
  stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`GET /trips/${tripId}/chat`]: () => ({ body: { messages: [agentMessage] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({
      body: {
        proposals: [
          { ...proposal, shares: [{ member: bashy, amount: "84000000", state: "approved" }] },
        ],
      },
    }),
  });
  await renderPlan();
  const ticket = await screen.findByRole("article", { name: "Tandem paragliding, Arambol" });
  expect(within(ticket).getByText(/Your balance doesn't move/)).toBeInTheDocument();
  expect(within(ticket).queryByRole("button")).not.toBeInTheDocument();
});

test("opens a participant ticket from the click before the asynchronous ticket request", async () => {
  const popup = { opener: window, location: { href: "" }, close: vi.fn() };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  stubApi({
    ...tripRoutes(tripId, me, linkedTrip()),
    [`GET /trips/${tripId}/chat`]: () => ({ body: { messages: [agentMessage] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({
      body: { proposals: [{ ...proposal, status: "fulfilled" }] },
    }),
    [`GET /trips/${tripId}/proposals/7/ticket`]: () => ({
      body: {
        proposalId: "7",
        code: "ticket-one",
        url: "https://tickets.example/one",
        holders: [me, bashy],
      },
    }),
  });
  await renderPlan();
  fireEvent.click(await screen.findByRole("button", { name: "View my ticket" }));
  expect(open).toHaveBeenCalledWith("", "_blank");
  await waitFor(() => expect(popup.location.href).toBe("https://tickets.example/one"));
  expect(popup.opener).toBeNull();
  expect(sendTransaction).not.toHaveBeenCalled();
});
