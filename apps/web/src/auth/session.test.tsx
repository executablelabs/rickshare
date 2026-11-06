import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { parseSiweMessage } from "viem/siwe";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { authApi, type Session } from "../lib/auth";
import { AuthGuard } from "./AuthGuard";
import { SessionProvider, useSession } from "./session";
import { type Wallet, WalletContext } from "./wallet";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const session = (address: `0x${string}` = alice): Session => ({
  address,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const signature = `0x${"ab".repeat(65)}` as const;
afterEach(() => vi.useRealTimers());
let wallet: Wallet;
let client: QueryClient;

function Probe() {
  const auth = useSession();
  return (
    <button type="button" onClick={() => void auth.signOut()}>
      End session
    </button>
  );
}

function Harness({ account = wallet, children }: { account?: Wallet; children?: ReactNode }) {
  return (
    <WalletContext.Provider value={account}>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <AuthGuard>{children ?? <p>Private trip</p>}</AuthGuard>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>
    </WalletContext.Provider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  wallet = {
    configured: true,
    ready: true,
    authenticated: true,
    address: alice,
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    signMessage: vi.fn(async () => signature),
  };
  vi.spyOn(authApi, "session").mockResolvedValue(null);
  vi.spyOn(authApi, "nonce").mockResolvedValue("abcdefgh12345678");
  vi.spyOn(authApi, "verify").mockImplementation(async () => {
    vi.mocked(authApi.session).mockResolvedValue(session());
    return session();
  });
  vi.spyOn(authApi, "logout").mockResolvedValue();
});

test("email login opens without an extension or wallet signature", async () => {
  render(<Harness account={{ ...wallet, authenticated: false, address: undefined }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(wallet.login).toHaveBeenCalledOnce();
  expect(wallet.signMessage).not.toHaveBeenCalled();
});

test("signs the browser-bound Arc challenge and only then reveals the trip", async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Private trip")).toBeInTheDocument();
  const message = vi.mocked(wallet.signMessage).mock.calls[0]?.[0];
  expect(message).toBeDefined();
  expect(parseSiweMessage(message ?? "")).toMatchObject({
    address: alice,
    chainId: 5042002,
    domain: window.location.host,
    uri: window.location.origin,
    nonce: "abcdefgh12345678",
    version: "1",
  });
  expect(authApi.verify).toHaveBeenCalledWith(message, signature);
});

test("a declined signature stays signed out and can be retried with a new nonce", async () => {
  vi.mocked(wallet.signMessage).mockRejectedValueOnce(new Error("User rejected"));
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in did not finish");
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
  expect(authApi.verify).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Private trip")).toBeInTheDocument();
  expect(authApi.nonce).toHaveBeenCalledTimes(2);
});

test("never reveals a session belonging to another account", async () => {
  vi.mocked(authApi.session).mockResolvedValue(session(bob));
  vi.mocked(authApi.verify).mockResolvedValue(session(bob));
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
});

test("switching accounts while signing discards the old sign-in before verification", async () => {
  let finish: ((value: `0x${string}`) => void) | undefined;
  vi.mocked(wallet.signMessage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  await waitFor(() => expect(finish).toBeDefined());
  view.rerender(<Harness account={{ ...wallet, address: bob }} />);
  await act(async () => finish?.(signature));
  expect(authApi.verify).not.toHaveBeenCalled();
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
});

test("sign-out waits for verification and revokes its cookie before disconnecting", async () => {
  let finish: ((value: ReturnType<typeof session>) => void) | undefined;
  vi.mocked(authApi.verify).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  expect(authApi.logout).not.toHaveBeenCalled();
  await act(async () => finish?.(session()));
  await waitFor(() => expect(wallet.logout).toHaveBeenCalledOnce());
  expect(authApi.logout).toHaveBeenCalledOnce();
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
});

test("failed sign-out immediately hides private content and retains a retry", async () => {
  vi.mocked(authApi.session).mockResolvedValue(session());
  vi.mocked(authApi.logout).mockRejectedValueOnce(new Error("Offline"));
  render(<Harness />);
  expect(await screen.findByText("Private trip")).toBeInTheDocument();
  client.setQueryData(["ticket", alice], "private-url");
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign-out did not finish");
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
  expect(client.getQueryData(["ticket", alice])).toBeUndefined();
  expect(wallet.logout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(wallet.logout).toHaveBeenCalledOnce());
});

test("expired sessions cannot reveal the trip", async () => {
  vi.mocked(authApi.session).mockResolvedValue({ ...session(), expiresAt: "2020-01-01T00:00:00Z" });
  render(<Harness />);
  expect(await screen.findByRole("button", { name: "Continue" })).toBeInTheDocument();
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
});

test("an open trip is hidden when its session expires", async () => {
  vi.useFakeTimers();
  vi.mocked(authApi.session).mockResolvedValue(session());
  render(<Harness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByText("Private trip")).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.queryByText("Private trip")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
});
