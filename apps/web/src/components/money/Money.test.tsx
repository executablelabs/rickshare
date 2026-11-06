import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type WalletCall, WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi, tripFixture, tripRoutes } from "../../test/api";

const me = "0x1111111111111111111111111111111111111111";
const tripId = "0x3fa2000000000000000000000000000000000001";
const hash = `0x${"ab".repeat(32)}` as const;
const sendTransaction = vi.fn(async (_call: WalletCall) => hash);
let trip = tripFixture(tripId, me);
const snapshot = () => ({
  members: trip.members.map((member) => ({
    ...member,
    deposited: "100000000",
    available: "72500000",
    spent: "20000000",
    locked: "7500000",
  })),
  indexedBlock: "100",
  walletBalance: "75000000",
  settled: false,
  own: {
    deposited: "100000000",
    spent: "20000000",
    locked: "7500000",
    available: "72500000",
    withdrawn: "0",
  },
});
let money = snapshot();
beforeEach(() => {
  vi.restoreAllMocks();
  sendTransaction.mockReset().mockResolvedValue(hash);
  trip = tripFixture(tripId, me);
  money = snapshot();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
});
function reads(extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    ...tripRoutes(tripId, me, trip),
    [`GET /trips/${tripId}/money`]: () => ({ body: money }),
    [`GET /trips/${tripId}/history`]: () => ({ body: { events: [], nextCursor: null } }),
    ...extra,
  });
}
async function openMoney() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/trips/${tripId}/money`] }),
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

test("uses the fixed-block snapshot for own and group balances", async () => {
  reads();
  await openMoney();
  const own = await screen.findByRole("region", { name: "Your balance" });
  expect(within(own).getByText("$72.50")).toBeInTheDocument();
  expect(within(own).getByText("Withdrawn")).toBeInTheDocument();
  expect(
    within(await screen.findByRole("region", { name: "The group" })).getAllByText("$72.50"),
  ).toHaveLength(2);
});

test("failed balance reads show an error without inventing a zero balance", async () => {
  reads({
    [`GET /trips/${tripId}/money`]: () => ({
      status: 503,
      body: { error: { code: "UNAVAILABLE", message: "Balances could not be loaded." } },
    }),
  });
  await openMoney();
  expect(await screen.findByText("Balances could not be loaded.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Your balance" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Withdraw money" })).not.toBeInTheDocument();
});

test("rejects non-integer base-unit balances before enabling money actions", async () => {
  money.own.available = "72.5";
  reads();
  await openMoney();
  expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Your balance" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Withdraw money" })).not.toBeInTheDocument();
});
