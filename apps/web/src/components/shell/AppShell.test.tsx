import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  render(<AppProviders router={router} />);
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
  render(<AppProviders router={router} />);
  expect(await screen.findByRole("heading", { name: "Plan", level: 1 })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/trips/india26/plan");
});

test("does not wrap pages outside a trip", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  await router.load();
  render(<AppProviders router={router} />);
  await screen.findByRole("heading", { name: "Rickshare", level: 1 });
  expect(screen.queryByRole("navigation", { name: "Trip" })).not.toBeInTheDocument();
});

test("brands the header band when there is no trip name yet", async () => {
  await renderAt("/trips/india26/plan");
  expect(screen.getByRole("banner")).toHaveTextContent("Rickshare");
});
