import type { Trip } from "@rickshare/shared";
import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getAddress } from "viem";
import { beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi } from "../../test/api";

const me = "0x1111111111111111111111111111111111111111";
const vault = "0x3fa2000000000000000000000000000000000001";
const hash = `0x${"ab".repeat(32)}` as const;
const sendTransaction = vi.fn(async () => hash);

const member = (address: string, displayName: string, available: string) => ({
  address,
  displayName,
  ensName: null,
  worldLinked: false,
  policy: { autoApproveMax: "0", totalCap: "0" },
  deposited: available,
  spent: "0",
  locked: "0",
  available,
});
const india: Trip = {
  id: vault,
  name: "India 26",
  ensName: null,
  vaultAddress: vault,
  endsAt: "2026-12-18T23:59:00.000Z",
  members: [member(me, "Angie", "120000000"), member(`0x${"2".repeat(40)}`, "Bashy", "0")],
};
const transaction = {
  chainId: 5042002,
  from: me,
  to: `0x${"f".repeat(40)}`,
  data: "0x1234",
  value: "0x0",
  maxFeePerGas: "0x4a817c800",
  maxPriorityFeePerGas: "0x3b9aca00",
};

beforeEach(() => {
  vi.restoreAllMocks();
  sendTransaction.mockClear();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});

async function renderHome() {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
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

async function fillNewTrip(name: string, endsOn: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Start a trip" }));
  const sheet = await screen.findByRole("dialog", { name: "New trip" });
  fireEvent.change(within(sheet).getByLabelText("Trip name"), { target: { value: name } });
  fireEvent.change(within(sheet).getByLabelText("Start date"), { target: { value: endsOn } });
  fireEvent.change(within(sheet).getByLabelText("End date"), { target: { value: endsOn } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Create trip" }));
  return sheet;
}

test("lists the member's trips with their own balance", async () => {
  stubApi({ "GET /trips": () => ({ body: { trips: [india] } }) });
  await renderHome();
  const card = await screen.findByRole("link", { name: /India 26/ });
  expect(within(card).getByText("$120.00")).toBeInTheDocument();
  expect(card).toHaveAttribute("href", `/trips/${vault}/plan`);
});

test("creates a trip: prepare, send from the wallet, confirm, then open it", async () => {
  const calls = stubApi({
    "GET /trips": () => ({ body: { trips: [] } }),
    "POST /trips": () => ({
      body: { creationId: "c1", expiresAt: "2026-12-01T00:00:00.000Z", transaction },
    }),
    "POST /trips/confirm": () => ({ body: { tripId: vault, vaultAddress: vault, indexed: true } }),
    [`GET /trips/${vault}`]: () => ({ body: india }),
  });
  const router = await renderHome();

  await fillNewTrip("India 26", "2099-12-18");

  await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${vault}/plan`));
  expect(calls.find((call) => call.route === "POST /trips")?.body).toEqual({
    name: "India 26",
    startsAt: new Date("2099-12-18T00:00:00").toISOString(),
    endsAt: new Date("2099-12-18T23:59:00").toISOString(),
    location: "India",
  });
  expect(sendTransaction).toHaveBeenCalledWith({
    from: getAddress(me),
    to: getAddress(transaction.to),
    data: "0x1234",
    maxFeePerGas: "0x4a817c800",
    maxPriorityFeePerGas: "0x3b9aca00",
  });
  expect(calls.find((call) => call.route === "POST /trips/confirm")?.body).toEqual({
    creationId: "c1",
    transactionHash: hash,
  });
});

test("keeps the sheet open and explains a cancelled wallet request", async () => {
  stubApi({
    "GET /trips": () => ({ body: { trips: [] } }),
    "POST /trips": () => ({
      body: { creationId: "c1", expiresAt: "2026-12-01T00:00:00.000Z", transaction },
    }),
  });
  sendTransaction.mockRejectedValueOnce(new Error("User rejected the request."));
  await renderHome();

  const sheet = await fillNewTrip("Goa", "2099-01-02");

  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "You cancelled in your wallet. Nothing changed.",
  );
  expect(within(sheet).getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("asks for a name and both trip dates before preparing anything", async () => {
  const calls = stubApi({ "GET /trips": () => ({ body: { trips: [] } }) });
  await renderHome();

  const sheet = await fillNewTrip("", "");

  expect(within(sheet).getByText("Give the trip a name.")).toBeInTheDocument();
  expect(within(sheet).getByText("Choose a start date from today onwards.")).toBeInTheDocument();
  expect(
    within(sheet).getByText("Choose an end date on or after the start date."),
  ).toBeInTheDocument();
  expect(calls.some((call) => call.route === "POST /trips")).toBe(false);
});

test("fee coverage must succeed before requesting a wallet confirmation", async () => {
  stubApi({
    "GET /trips": () => ({ body: { trips: [] } }),
    "POST /trips": () => ({
      status: 503,
      body: {
        error: {
          code: "GAS_SPONSOR_EMPTY",
          message: "Rickshare's setup-fee balance needs a top-up. Please try again later.",
        },
      },
    }),
  });
  await renderHome();
  const sheet = await fillNewTrip("India 26", "2099-12-18");
  expect(await within(sheet).findByRole("alert")).toHaveTextContent("setup-fee balance");
  expect(within(sheet).getByText(/Rickshare covers the setup fee/)).toBeInTheDocument();
  expect(sendTransaction).not.toHaveBeenCalled();
});
