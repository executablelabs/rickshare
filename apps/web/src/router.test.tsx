import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "./auth/wallet";
import { RouteLoader } from "./components/brand/Loader";
import { authApi, type Session } from "./lib/auth";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";

const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});

test.each([
  ["/", "Your trips"],
  ["/trips/india26/plan", "Plan"],
  ["/trips/india26/itinerary", "Itinerary"],
  ["/trips/india26/money", "Money"],
  ["/dev/ui", "UI gallery"],
])("renders the heading at %s", async (path, heading) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  render(
    <StrictMode>
      <WalletContext.Provider
        value={{
          configured: true,
          ready: true,
          authenticated: true,
          address,
          login: vi.fn(),
          logout: vi.fn(),
          signMessage: vi.fn(),
          signTypedData: vi.fn(),
          sendTransaction: vi.fn(),
        }}
      >
        <AppProviders router={router} />
      </WalletContext.Provider>
    </StrictMode>,
  );
  expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
});

test.each(["/", "/trips/india26/plan", "/trips/india26/itinerary", "/trips/india26/money"])(
  "guards %s when wallet configuration is missing",
  async (path) => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    await router.load();
    render(<AppProviders router={router} />);
    expect(await screen.findByText(/Sign-in is being set up/)).toHaveAttribute("role", "status");
    expect(authApi.session).not.toHaveBeenCalled();
  },
);

test("an account change hides private UI until the new account has its own session", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/trips/india26/plan"] }));
  await router.load();
  const forAccount = (account: `0x${string}`) => (
    <WalletContext.Provider
      value={{
        configured: true,
        ready: true,
        authenticated: true,
        address: account,
        login: vi.fn(),
        logout: vi.fn(),
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        sendTransaction: vi.fn(),
      }}
    >
      <AppProviders router={router} />
    </WalletContext.Provider>
  );
  const view = render(forAccount(address));
  expect(await screen.findByRole("heading", { name: "Plan" })).toBeInTheDocument();
  let finish: ((value: Session) => void) | undefined;
  vi.mocked(authApi.session).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const next = "0x2222222222222222222222222222222222222222";
  view.rerender(forAccount(next));
  expect(screen.queryByRole("heading", { name: "Plan" })).not.toBeInTheDocument();
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () =>
    finish?.({ address: next, expiresAt: new Date(Date.now() + 60_000).toISOString() }),
  );
  expect(await screen.findByRole("heading", { name: "Plan" })).toBeInTheDocument();
});

test("shows the rickshaw loader while a route is pending", () => {
  expect(createAppRouter().options.defaultPendingComponent).toBe(RouteLoader);
});
