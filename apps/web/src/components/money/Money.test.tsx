import { tripVaultAbi } from "@rickshare/shared/abi";
import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { encodeFunctionData } from "viem";
import { beforeEach, expect, test, vi } from "vitest";
import { TransactionPendingError } from "../../auth/transactions";
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
const transaction = (data: `0x${string}`) => ({
  chainId: 5042002,
  from: me,
  to: trip.vaultAddress,
  data,
  value: "0x0",
  maxFeePerGas: "0x1",
  maxPriorityFeePerGas: "0x1",
});
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

test("withdraws only the chosen own amount with six-decimal precision", async () => {
  const data = encodeFunctionData({
    abi: tripVaultAbi,
    functionName: "withdraw",
    args: [10123456n],
  });
  const calls = reads({
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "withdraw", transactions: [transaction(data)] },
    }),
  });
  await openMoney();
  fireEvent.click(await screen.findByRole("button", { name: "Withdraw money" }));
  const dialog = await screen.findByRole("dialog", { name: "Withdraw money" });
  const amount = within(dialog).getByLabelText("Amount to withdraw in USDC");
  fireEvent.change(amount, { target: { value: "73" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw money" }));
  expect(
    await screen.findByText("Only your available balance can be withdrawn."),
  ).toBeInTheDocument();
  expect(sendTransaction).not.toHaveBeenCalled();
  fireEvent.change(amount, { target: { value: "10.123456" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw money" }));
  await waitFor(() =>
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ from: me, to: trip.vaultAddress, data }),
    ),
  );
  expect(calls.filter((call) => call.route.endsWith("/actions")).map((call) => call.body)).toEqual([
    { action: "withdraw", amount: "10123456" },
  ]);
  // Vaul retains the sheet until its exit animation completes.
  await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
});

test("withdraws the entire available balance without rounding away micro-units", async () => {
  money.own.available = "72500001";
  money.own.deposited = "100000001";
  const data = encodeFunctionData({
    abi: tripVaultAbi,
    functionName: "withdraw",
    args: [72500001n],
  });
  const calls = reads({
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "withdraw", transactions: [transaction(data)] },
    }),
  });
  await openMoney();
  fireEvent.click(await screen.findByRole("button", { name: "Withdraw money" }));
  const dialog = await screen.findByRole("dialog", { name: "Withdraw money" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Use available balance" }));
  expect(within(dialog).getByLabelText("Amount to withdraw in USDC")).toHaveValue("72.500001");
  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw money" }));
  await waitFor(() =>
    expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({ data })),
  );
  expect(calls.find((call) => call.route.endsWith("/actions"))?.body).toEqual({
    action: "withdraw",
    amount: "72500001",
  });
});

test("an uncertain withdrawal receipt reuses its prepared call and freezes the amount", async () => {
  sendTransaction.mockRejectedValueOnce(new TransactionPendingError(hash));
  const data = encodeFunctionData({
    abi: tripVaultAbi,
    functionName: "withdraw",
    args: [10000000n],
  });
  const calls = reads({
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "withdraw", transactions: [transaction(data)] },
    }),
  });
  await openMoney();
  fireEvent.click(await screen.findByRole("button", { name: "Withdraw money" }));
  const dialog = await screen.findByRole("dialog", { name: "Withdraw money" });
  fireEvent.change(within(dialog).getByLabelText("Amount to withdraw in USDC"), {
    target: { value: "10" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw money" }));
  const retry = await within(dialog).findByRole("button", { name: "Check previous attempt" });
  expect(within(dialog).getByLabelText("Amount to withdraw in USDC")).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(sendTransaction).toHaveBeenCalledTimes(2));
  expect(sendTransaction.mock.calls[0]).toEqual(sendTransaction.mock.calls[1]);
  expect(calls.filter((call) => call.route.endsWith("/actions"))).toHaveLength(1);
});

test.each(["vault", "caller", "chain", "amount", "extra call", "native value"])(
  "refuses mismatched prepared withdrawals: %s",
  async (changed) => {
    const data = encodeFunctionData({
      abi: tripVaultAbi,
      functionName: "withdraw",
      args: [10000000n],
    });
    const call = transaction(data);
    if (changed === "vault") call.to = `0x${"5".repeat(40)}`;
    if (changed === "caller") call.from = `0x${"2".repeat(40)}`;
    if (changed === "chain") call.chainId = 1;
    if (changed === "amount")
      call.data = encodeFunctionData({
        abi: tripVaultAbi,
        functionName: "withdraw",
        args: [20000000n],
      });
    if (changed === "native value") call.value = "0x1";
    reads({
      [`POST /trips/${tripId}/actions`]: () => ({
        body: {
          action: "withdraw",
          transactions: changed === "extra call" ? [call, call] : [call],
        },
      }),
    });
    await openMoney();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw money" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw money" });
    fireEvent.change(within(dialog).getByLabelText("Amount to withdraw in USDC"), {
      target: { value: "10" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw money" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(sendTransaction).not.toHaveBeenCalled();
  },
);

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
