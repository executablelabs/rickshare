import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../providers";
import { createAppRouter } from "../../router";

test("signed out, the home page is the landing page with its example labelled", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  await router.load();
  render(<AppProviders router={router} />);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Plan together. Go further. Pay only your share.",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 2, name: /The group chat has ideas/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("figure", { name: "Example trip" })).toBeInTheDocument();
  expect(screen.getByText(/Sign-in is being set up/)).toHaveAttribute("role", "status");
});
