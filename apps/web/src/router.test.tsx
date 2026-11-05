import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";

test.each([
  ["/", "Rickshare"],
  ["/trips/india26/plan", "Plan"],
  ["/trips/india26/itinerary", "Itinerary"],
  ["/trips/india26/money", "Money"],
  ["/dev/ui", "UI gallery"],
])("renders the heading at %s", async (path, heading) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  render(<AppProviders router={router} />);
  expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
});
