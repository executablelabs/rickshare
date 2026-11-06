import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getAddress } from "viem";
import { beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi, tripFixture, tripRoutes } from "../../test/api";

const me = "0x1111111111111111111111111111111111111111";
const tripId = "0x3fa2000000000000000000000000000000000001";
const hash = `0x${"ab".repeat(32)}` as const;
const sendTransaction = vi.fn(async (_call: { to: string }) => hash);
const signTypedData = vi.fn(async () => `0x${"cd".repeat(65)}` as const);
const tx = (to: string) => ({
  chainId: 5042002,
  from: me,
  to,
  data: "0x12",
  value: "0x0",
  maxFeePerGas: "0x1",
  maxPriorityFeePerGas: "0x1",
});
const usdc = `0x${"3".repeat(40)}`;
const vault = `0x${"4".repeat(40)}`;

beforeEach(() => {
  vi.restoreAllMocks();
  sendTransaction.mockClear();
  signTypedData.mockClear();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
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
        signTypedData,
        sendTransaction,
      }}
    >
      <AppProviders router={router} />
    </WalletContext.Provider>,
  );
  return router;
}

const organizerInvites = (invites: unknown[]) => ({
  [`GET /trips/${tripId}/invites`]: () => ({ body: { invites } }),
});

test.each(["vault", "member", "chain", "type"])(
  "refuses an invitation with a different %s before signing",
  async (changed) => {
    const friend = `0x${"5".repeat(40)}`;
    const solo = tripFixture(tripId, me);
    solo.members = solo.members.slice(0, 1);
    stubApi({
      ...tripRoutes(tripId, me, solo),
      ...organizerInvites([
        {
          inviteId: "i1",
          status: "claimed",
          member: friend,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      ]),
      [`GET /trips/${tripId}/invites/i1/authorization`]: () => ({
        body: {
          authorized: false,
          typedData: {
            domain: {
              name: "Rickshare TripVault",
              version: "1",
              chainId: changed === "chain" ? 1 : 5042002,
              verifyingContract: changed === "vault" ? me : solo.vaultAddress,
            },
            primaryType: changed === "type" ? "Permit" : "Invite",
            message: { member: changed === "member" ? me : friend, deadline: "4070908800" },
          },
        },
      }),
    });
    await renderAt(`/trips/${tripId}/plan`);
    fireEvent.click(await screen.findByRole("button", { name: "Invite" }));
    const sheet = await screen.findByRole("dialog", { name: "Invite friends" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Let them in" }));
    expect(
      await screen.findByText("This invitation changed. Refresh the trip before signing."),
    ).toBeInTheDocument();
    expect(signTypedData).not.toHaveBeenCalled();
  },
);

test("a new member sees the setup steps, without inviting unless they organized it", async () => {
  stubApi(tripRoutes(tripId, me));
  await renderAt(`/trips/${tripId}/plan`);
  const checklist = await screen.findByRole("region", { name: "Get the trip ready" });
  expect(within(checklist).getByText("0 of 3 done")).toBeInTheDocument();
  expect(within(checklist).queryByText("Invite friends")).not.toBeInTheDocument();
  expect(within(checklist).getByText("Verify with World")).toBeInTheDocument();
});

test("the organizer also gets an invite step, and the checklist goes once all is done", async () => {
  const done = tripFixture(tripId, me);
  done.members = done.members.map((member) => ({
    ...member,
    worldLinked: true,
    deposited: "50000000",
    available: "50000000",
    policy: { autoApproveMax: "10000000", totalCap: "100000000" },
  }));
  stubApi({ ...tripRoutes(tripId, me), ...organizerInvites([]) });
  await renderAt(`/trips/${tripId}/plan`);
  const checklist = await screen.findByRole("region", { name: "Get the trip ready" });
  expect(await within(checklist).findByText("Invite friends")).toBeInTheDocument();

  stubApi({ ...tripRoutes(tripId, me, done), ...organizerInvites([]) });
  await renderAt(`/trips/${tripId}/plan`);
  await waitFor(() =>
    expect(screen.getAllByRole("region", { name: "Get the trip ready" })).toHaveLength(1),
  );
});

test("add money prepares a deposit and sends every transaction in order", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me),
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "deposit", transactions: [tx(usdc), tx(vault)] },
    }),
  });
  await renderAt(`/trips/${tripId}/money`);
  fireEvent.click((await screen.findAllByRole("button", { name: "Add money" }))[0] as HTMLElement);
  const sheet = await screen.findByRole("dialog", { name: "Add money" });
  fireEvent.change(within(sheet).getByLabelText("Amount in USDC"), { target: { value: "50" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Add money" }));

  expect(await screen.findByText("$50.00 added")).toBeInTheDocument();
  expect(calls.find((call) => call.route === `POST /trips/${tripId}/actions`)?.body).toEqual({
    action: "deposit",
    amount: "50000000",
  });
  expect(sendTransaction.mock.calls.map(([call]) => call.to)).toEqual([
    getAddress(usdc),
    getAddress(vault),
  ]);
});

test("add money refuses more than the wallet holds before preparing anything", async () => {
  const calls = stubApi(tripRoutes(tripId, me));
  await renderAt(`/trips/${tripId}/money`);
  fireEvent.click((await screen.findAllByRole("button", { name: "Add money" }))[0] as HTMLElement);
  const sheet = await screen.findByRole("dialog", { name: "Add money" });
  await within(sheet).findByText("In your wallet: $75.00");
  fireEvent.change(within(sheet).getByLabelText("Amount in USDC"), { target: { value: "80" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Add money" }));
  expect(within(sheet).getByText(/Your wallet has \$75\.00/)).toBeInTheDocument();
  expect(calls.some((call) => call.route.startsWith("POST"))).toBe(false);
});

test("a deposit retry resumes after the successful approval without preparing it again", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me),
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "deposit", transactions: [tx(usdc), tx(vault)] },
    }),
  });
  sendTransaction
    .mockResolvedValueOnce(hash)
    .mockRejectedValueOnce(new Error("Receipt unavailable"))
    .mockResolvedValue(hash);
  await renderAt(`/trips/${tripId}/money`);
  fireEvent.click((await screen.findAllByRole("button", { name: "Add money" }))[0] as HTMLElement);
  const sheet = await screen.findByRole("dialog", { name: "Add money" });
  fireEvent.change(within(sheet).getByLabelText("Amount in USDC"), { target: { value: "50" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Add money" }));
  await within(sheet).findByText("Receipt unavailable");
  fireEvent.click(within(sheet).getByRole("button", { name: "Check previous attempt" }));
  expect(await screen.findByText("$50.00 added")).toBeInTheDocument();
  expect(sendTransaction.mock.calls.map(([call]) => call.to)).toEqual([
    getAddress(usdc),
    getAddress(vault),
    getAddress(vault),
  ]);
  expect(calls.filter((call) => call.route === `POST /trips/${tripId}/actions`)).toHaveLength(1);
});

test("my limits keeps a single approval within the total cap, then saves both", async () => {
  const calls = stubApi({
    ...tripRoutes(tripId, me),
    [`POST /trips/${tripId}/actions`]: () => ({
      body: { action: "policy", transactions: [tx(vault)] },
    }),
  });
  await renderAt(`/trips/${tripId}/money`);
  fireEvent.click(await screen.findByRole("button", { name: "My limits" }));
  const sheet = await screen.findByRole("dialog", { name: "My limits" });
  fireEvent.change(within(sheet).getByLabelText("Approve automatically up to"), {
    target: { value: "40" },
  });
  fireEvent.change(within(sheet).getByLabelText("Total cap"), { target: { value: "20" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save limits" }));
  expect(
    within(sheet).getByText(/can't be lower than a single automatic approval/),
  ).toBeInTheDocument();

  fireEvent.change(within(sheet).getByLabelText("Total cap"), { target: { value: "200" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save limits" }));
  expect(await screen.findByText("Limits saved")).toBeInTheDocument();
  expect(calls.find((call) => call.route === `POST /trips/${tripId}/actions`)?.body).toEqual({
    action: "policy",
    autoApproveMax: "40000000",
    totalCap: "200000000",
  });
});

test("the organizer lets a friend in by signing the invite with a numeric deadline", async () => {
  const friend = `0x${"5".repeat(40)}`;
  // Only the organizer so far, so the invite step is still open.
  const solo = tripFixture(tripId, me);
  solo.members = solo.members.slice(0, 1);
  const calls = stubApi({
    ...tripRoutes(tripId, me, solo),
    ...organizerInvites([
      { inviteId: "i1", status: "claimed", member: friend, expiresAt: "2099-01-01T00:00:00.000Z" },
    ]),
    [`GET /trips/${tripId}/invites/i1/authorization`]: () => ({
      body: {
        authorized: false,
        typedData: {
          domain: {
            name: "Rickshare TripVault",
            version: "1",
            chainId: 5042002,
            verifyingContract: solo.vaultAddress,
          },
          types: {
            Invite: [
              { name: "member", type: "address" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Invite",
          message: { member: friend, deadline: "4070908800" },
        },
      },
    }),
    [`POST /trips/${tripId}/invites/i1/authorization`]: () => ({
      body: { typedData: null, authorized: true },
    }),
  });
  await renderAt(`/trips/${tripId}/plan`);
  fireEvent.click(await screen.findByRole("button", { name: "Invite" }));
  const sheet = await screen.findByRole("dialog", { name: "Invite friends" });
  fireEvent.click(await within(sheet).findByRole("button", { name: "Let them in" }));

  expect(await screen.findByText("They can join now")).toBeInTheDocument();
  expect(signTypedData).toHaveBeenCalledWith(
    expect.objectContaining({
      primaryType: "Invite",
      message: { member: friend, deadline: 4070908800n },
    }),
  );
  expect(
    calls.find((call) => call.route === `POST /trips/${tripId}/invites/i1/authorization`)?.body,
  ).toEqual({ signature: `0x${"cd".repeat(65)}` });
});
