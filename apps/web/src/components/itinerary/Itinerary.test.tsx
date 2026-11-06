import type { ItineraryItem, Proposal } from "@rickshare/shared";
import { createMemoryHistory } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WalletContext } from "../../auth/wallet";
import { authApi } from "../../lib/auth";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";
import { stubApi, tripRoutes } from "../../test/api";

const me = "0x1111111111111111111111111111111111111111";
const friend = `0x${"2".repeat(40)}`;
const tripId = "0x3fa2000000000000000000000000000000000001";
const proposal: Proposal = {
  id: "7",
  tripId,
  merchant: `0x${"d".repeat(40)}`,
  merchantName: "Goa Adventures",
  title: "Booked ferry",
  location: "Mumbai",
  startsAt: "2026-12-12T12:00:00.000Z",
  total: "10000000",
  shares: [{ member: me, amount: "10000000", state: "approved" }],
  status: "fulfilled",
  deadline: "2026-12-11T12:00:00.000Z",
  ticketHash: "0x01",
  txHash: "0x02",
};
const item = (id: string, startsAt: string): ItineraryItem => ({
  id,
  startsAt,
  title: id,
  location: "Goa",
  proposalId: null,
  ticketUrls: ["https://private.example/do-not-use"],
});
const listeners = new Map<string, (event: MessageEvent<string>) => void>();
const close = vi.fn();
beforeEach(() => {
  vi.restoreAllMocks();
  listeners.clear();
  close.mockClear();
  vi.spyOn(authApi, "session").mockResolvedValue({
    address: me,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        listeners.set(type, listener);
      }
      close = close;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function openItinerary() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/trips/${tripId}/itinerary`] }),
  );
  await router.load();
  return render(
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
        sendTransaction: vi.fn(),
      }}
    >
      <AppProviders router={router} />
    </WalletContext.Provider>,
  );
}

test("groups in calendar order and refreshes itinerary events while this tab is open", async () => {
  let items = [
    item("Last day", "2026-12-13T12:00:00.000Z"),
    item("First day", "2026-12-12T12:00:00.000Z"),
  ];
  stubApi({
    ...tripRoutes(tripId, me),
    [`GET /trips/${tripId}/itinerary`]: () => ({ body: { items } }),
  });
  const view = await openItinerary();
  await screen.findByRole("article", { name: "Last day" });
  const main = within(screen.getByRole("main"));
  expect(main.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "First day",
    "Last day",
  ]);
  expect(main.getAllByRole("region")).toHaveLength(2);
  expect(document.querySelector('a[href="https://private.example/do-not-use"]')).toBeNull();
  items = [item("Updated day", "2026-12-12T13:00:00.000Z")];
  act(() =>
    listeners.get("itinerary.updated")?.(
      new MessageEvent("itinerary.updated", {
        data: JSON.stringify({ type: "itinerary.updated", items: [] }),
      }),
    ),
  );
  expect(await screen.findByRole("article", { name: "Updated day" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Last day" })).not.toBeInTheDocument();
  view.unmount();
  expect(close).toHaveBeenCalledTimes(1);
});

test("keeps a paid booking missing from the outline and opens only the viewer's private ticket", async () => {
  const popup = { opener: window, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const calls = stubApi({
    ...tripRoutes(tripId, me),
    [`GET /trips/${tripId}/itinerary`]: () => ({ body: { items: [] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({
      body: {
        proposals: [
          proposal,
          {
            ...proposal,
            id: "8",
            title: "Friend's booking",
            shares: [{ member: friend, amount: "10000000", state: "approved" }],
          },
        ],
      },
    }),
    [`GET /trips/${tripId}/proposals/7/ticket`]: () => ({
      body: {
        proposalId: "7",
        code: "ferry",
        url: "https://merchant.example/tickets/ferry",
        holders: [me],
      },
    }),
  });
  await openItinerary();
  const mine = await screen.findByRole("article", { name: "Booked ferry" });
  expect(
    within(await screen.findByRole("article", { name: "Friend's booking" })).queryByRole("button"),
  ).not.toBeInTheDocument();
  expect(calls.filter((call) => call.route.endsWith("/ticket"))).toHaveLength(0);
  fireEvent.click(within(mine).getByRole("button", { name: "View my ticket" }));
  await waitFor(() => expect(popup.location.href).toBe("https://merchant.example/tickets/ferry"));
  expect(popup.opener).toBeNull();
  expect(calls.filter((call) => call.route.endsWith("/ticket"))).toHaveLength(1);
});

test("an empty itinerary points back to the planner", async () => {
  stubApi({
    ...tripRoutes(tripId, me),
    [`GET /trips/${tripId}/itinerary`]: () => ({ body: { items: [] } }),
  });
  await openItinerary();
  expect(await screen.findByText("No plans yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ask the planner" })).toHaveAttribute(
    "href",
    `/trips/${tripId}/plan`,
  );
});

test("groups UTC instants by the member's local day", async () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  stubApi({
    ...tripRoutes(tripId, me),
    [`GET /trips/${tripId}/itinerary`]: () => ({
      body: {
        items: [
          item("Late walk", "2026-12-12T00:00:00.000Z"),
          item("Afternoon tea", "2026-12-11T23:00:00.000Z"),
        ],
      },
    }),
  });
  await openItinerary();
  await screen.findByRole("article", { name: "Late walk" });
  expect(within(screen.getByRole("main")).getAllByRole("region")).toHaveLength(1);
});

test("an itinerary failure offers a working retry instead of an empty schedule", async () => {
  let failed = true;
  stubApi({
    ...tripRoutes(tripId, me),
    [`GET /trips/${tripId}/itinerary`]: () =>
      failed
        ? {
            status: 403,
            body: {
              error: { code: "UNAVAILABLE", message: "The itinerary is unavailable. Try again." },
            },
          }
        : { body: { items: [item("Recovered", "2026-12-12T12:00:00.000Z")] } },
  });
  await openItinerary();
  expect(await screen.findByText("The itinerary is unavailable. Try again.")).toBeInTheDocument();
  expect(screen.queryByText("No plans yet")).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("article", { name: "Recovered" })).toBeInTheDocument();
});
