import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { tripApi } from "../../lib/trips";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi } from "../../test/api";

const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(tripApi, "get").mockImplementation(() => new Promise(() => {}));
  vi.spyOn(authApi, "session").mockResolvedValue({
    address,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});
function SignedIn({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </WalletContext.Provider>
  );
}

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  render(
    <SignedIn>
      <AppProviders router={router} />
    </SignedIn>,
  );
  return screen.findByRole("navigation", { name: "Trip" });
}

test("links every tab to the current trip", async () => {
  const nav = await renderAt("/trips/india26/itinerary");
  const links = within(nav).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(["Plan", "Itinerary", "Money"]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/trips/india26/plan",
    "/trips/india26/itinerary",
    "/trips/india26/money",
  ]);
});

test("marks only the current tab as the current page", async () => {
  const nav = await renderAt("/trips/india26/money");
  expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("Money");
});

test("sends the bare trip URL to the Plan tab", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/trips/india26"] }));
  await router.load();
  render(
    <SignedIn>
      <AppProviders router={router} />
    </SignedIn>,
  );
  expect(await screen.findByRole("heading", { name: "Plan", level: 1 })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/trips/india26/plan");
});

test("does not wrap pages outside a trip", async () => {
  stubApi({ "GET /trips": () => ({ body: { trips: [] } }) });
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  await router.load();
  render(
    <SignedIn>
      <AppProviders router={router} />
    </SignedIn>,
  );
  await screen.findByRole("heading", { name: "Your trips", level: 1 });
  expect(screen.queryByRole("navigation", { name: "Trip" })).not.toBeInTheDocument();
});

test("brands the header band when there is no trip name yet", async () => {
  await renderAt("/trips/india26/plan");
  expect(screen.getByRole("banner")).toHaveTextContent("Rickshare");
});

test("loads the trip title and confirmed ENS identity into the header", async () => {
  vi.mocked(tripApi.get).mockResolvedValue({
    id: "india26",
    vaultAddress: address,
    name: "India 26",
    endsAt: "2030-01-01T00:00:00.000Z",
    ensName: "india-26-1111.rickshare.eth",
    members: [],
  });
  await renderAt("/trips/india26/plan");
  await screen.findByText("india-26-1111.rickshare.eth");
  expect(screen.getByRole("banner")).toHaveTextContent("India 26");
  expect(screen.getByRole("banner")).toHaveTextContent("india-26-1111.rickshare.eth");
});
