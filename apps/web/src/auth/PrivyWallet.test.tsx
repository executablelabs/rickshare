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
    user: { wallet: { address: "0x1111111111111111111111111111111111111111" } },
  }),
  useWallets: () => ({
    ready: true,
    wallets: [
      {
        address: "0x1111111111111111111111111111111111111111",
        switchChain: mocks.switchChain,
        getEthereumProvider: async () => ({ request: mocks.request }),
      },
    ],
  }),
}));

function Sign() {
  const wallet = useWallet();
  const [result, setResult] = useState("");
  return (
    <>
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
  mocks.request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return "0x4cef52";
    if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
    if (method === "personal_sign") return `0x${"ab".repeat(65)}`;
    throw new Error(`Unexpected RPC: ${method}`);
  });
});

test("creates an email-based embedded wallet and signs on Arc", async () => {
  render(
    <PrivyWallet appId="test-app">
      <Sign />
    </PrivyWallet>,
  );
  expect(mocks.config).toHaveBeenCalledWith(
    expect.objectContaining({
      loginMethods: ["email"],
      defaultChain: expect.objectContaining({ id: 5042002 }),
      embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^0x/));
  expect(mocks.switchChain).toHaveBeenCalledWith(5042002);
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
