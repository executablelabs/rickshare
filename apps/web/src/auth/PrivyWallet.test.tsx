import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import PrivyWallet from "./PrivyWallet";
import { useWallet } from "./wallet";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  switchChain: vi.fn(),
  request: vi.fn(),
  primaryAddress: "0x1111111111111111111111111111111111111111",
  accounts: ["0x1111111111111111111111111111111111111111"],
  unlinkedAccounts: [] as string[],
  activeWallet: undefined as
    | { type: "ethereum" | "solana"; address: string; linked: boolean }
    | undefined,
}));
vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children, config }: { children: ReactNode; config: unknown }) => {
    mocks.config(config);
    return children;
  },
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    user: { wallet: { address: mocks.primaryAddress } },
  }),
  useActiveWallet: () => ({ wallet: mocks.activeWallet }),
  useWallets: () => ({
    ready: true,
    wallets: mocks.accounts.map((address) => ({
      type: "ethereum",
      linked: !mocks.unlinkedAccounts.includes(address),
      address,
      switchChain: mocks.switchChain,
      getEthereumProvider: async () => ({ request: mocks.request }),
    })),
  }),
}));

function Sign() {
  const wallet = useWallet();
  const [result, setResult] = useState("");
  return (
    <>
      <p>Account: {wallet.address ?? "none"}</p>
      <button
        type="button"
        onClick={() => {
          void wallet
            .signMessage("Rickshare challenge")
            .then(setResult, () => setResult("Account mismatch"));
        }}
      >
        Sign in
      </button>
      <p role="status">{result}</p>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.primaryAddress = "0x1111111111111111111111111111111111111111";
  mocks.accounts = [mocks.primaryAddress];
  mocks.unlinkedAccounts = [];
  mocks.activeWallet = undefined;
  mocks.switchChain.mockResolvedValue(undefined);
  mocks.request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return "0x4cef52";
    if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
    if (method === "personal_sign") return `0x${"ab".repeat(65)}`;
    throw new Error(`Unexpected RPC: ${method}`);
  });
});

test("offers Google, email and Ethereum wallets while retaining embedded creation and Arc signing", async () => {
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  expect(mocks.config).toHaveBeenCalledWith(
    expect.objectContaining({
      loginMethods: ["email", "google", "wallet"],
      appearance: { walletChainType: "ethereum-only" },
      defaultChain: expect.objectContaining({ id: 5042002 }),
      embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^0x/));
  expect(mocks.switchChain).toHaveBeenCalledWith(5042002);
});

test("signs with the active linked external wallet instead of an older embedded wallet", async () => {
  const external = "0x2222222222222222222222222222222222222222";
  mocks.accounts.push(external);
  mocks.activeWallet = { type: "ethereum", address: external, linked: true };
  const defaultRequest = mocks.request.getMockImplementation();
  mocks.request.mockImplementation(async (input: { method: string }) =>
    input.method === "eth_accounts" ? [external] : defaultRequest?.(input),
  );
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  expect(screen.getByText(`Account: ${external}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^0x/));
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "personal_sign",
      params: [expect.any(String), external],
    }),
    undefined,
  );
});

test("ignores an unlinked connected account when choosing the authenticated signer", () => {
  const external = "0x2222222222222222222222222222222222222222";
  mocks.accounts.push(external);
  mocks.unlinkedAccounts = [external];
  mocks.activeWallet = { type: "ethereum", address: external, linked: false };
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  expect(screen.getByText(`Account: ${mocks.primaryAddress}`)).toBeInTheDocument();
});

test("does not silently substitute another wallet while the selected account is disconnected", async () => {
  mocks.activeWallet = {
    type: "ethereum",
    address: "0x2222222222222222222222222222222222222222",
    linked: true,
  };
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  expect(screen.getByText("Account: none")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Account mismatch"));
  expect(mocks.switchChain).not.toHaveBeenCalled();
});

test("a refused network switch never requests a signature", async () => {
  mocks.switchChain.mockRejectedValueOnce(new Error("User rejected network switch"));
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Account mismatch"));
  expect(mocks.request).not.toHaveBeenCalled();
});

test.each(["eth_chainId", "eth_accounts"])(
  "refuses a mismatched %s before signing",
  async (mismatch) => {
    mocks.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_accounts")
        return [
          mismatch === method
            ? "0x2222222222222222222222222222222222222222"
            : "0x1111111111111111111111111111111111111111",
        ];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`Unexpected RPC: ${method}`);
    });
    render(
      <PrivyWallet appId="test-app">
        <Sign />
      </PrivyWallet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Account mismatch"));
    expect(mocks.request.mock.calls.some(([input]) => input.method === "personal_sign")).toBe(
      false,
    );
  },
);
