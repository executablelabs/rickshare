import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "./auth/wallet";
import { authApi } from "./lib/auth";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";
import { stubApi, tripRoutes } from "./test/api";

const me = "0x1111111111111111111111111111111111111111";
const tripId = "0x3fa2000000000000000000000000000000000001";
const hash = `0x${"ab".repeat(32)}` as const;
const sendTransaction = vi.fn(async () => hash);
const joinTx = {
  chainId: 5042002,
  from: me,
  to: tripId,
  data: "0x12",
  value: "0x0",
  maxFeePerGas: "0x1",
  maxPriorityFeePerGas: "0x1",
};
const invite = (status: string, transaction: unknown = null) => ({
  inviteId: "i1",
  tripId,
  status,
  expiresAt: "2099-01-01T00:00:00.000Z",
  transaction,
});

beforeEach(() => {
  vi.restoreAllMocks();
  sendTransaction.mockClear();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});

async function renderJoin() {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/join/tok123"] }));
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
  return router;
}

test("waits for the organizer after claiming the link", async () => {
  stubApi({
    "POST /invites/tok123/claim": () => ({ body: invite("claimed") }),
    "GET /invites/i1": () => ({ body: invite("claimed") }),
  });
  await renderJoin();
  expect(
    await screen.findByRole("heading", { name: "Waiting for the organizer" }),
  ).toBeInTheDocument();
});

test("once let in, joins from the wallet, then names the member and opens the trip", async () => {
  let joined = false;
  const calls = stubApi({
    ...tripRoutes(tripId, me),
    "GET /trips": () => ({ body: { trips: [] } }),
    "POST /invites/tok123/claim": () => ({ body: invite("authorized", joinTx) }),
    "GET /invites/i1": () => ({ body: joined ? invite("joined") : invite("authorized", joinTx) }),
    "POST /invites/i1/confirm": () => {
      joined = true;
      return { body: { tripId, joined: true } };
    },
    [`POST /trips/${tripId}/members/me`]: () => ({ body: { ok: true } }),
  });
  const router = await renderJoin();

  fireEvent.click(await screen.findByRole("button", { name: "Join the trip" }));
  const nameField = await screen.findByLabelText("Your name");
  expect(calls.find((call) => call.route === "POST /invites/i1/confirm")?.body).toEqual({
    transactionHash: hash,
  });

  fireEvent.change(nameField, { target: { value: "Bashy" } });
  fireEvent.click(screen.getByRole("button", { name: "Open the trip" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${tripId}/plan`));
  expect(calls.find((call) => call.route === `POST /trips/${tripId}/members/me`)?.body).toEqual({
    displayName: "Bashy",
  });
});

test("explains a link that cannot be used", async () => {
  stubApi({
    "POST /invites/tok123/claim": () => ({
      status: 409,
      body: { error: { code: "INVITE_EXPIRED", message: "Ask for a new invitation." } },
    }),
  });
  await renderJoin();
  expect(await screen.findByText("Ask for a new invitation.")).toHaveAttribute("role", "alert");
});
