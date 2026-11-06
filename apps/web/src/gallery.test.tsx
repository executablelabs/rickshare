import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";

async function renderGallery() {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/dev/ui"] }));
  await router.load();
  render(<AppProviders router={router} />);
  await screen.findByRole("heading", { name: "UI gallery", level: 1 });
}

test("shows a section for every primitive", async () => {
  await renderGallery();
  const sections = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(sections).toEqual([
    "Buttons",
    "Chips",
    "Amounts",
    "Avatars",
    "Fields",
    "Sheet",
    "Toasts",
    "Brand",
    "Tickets",
    "Trip cards",
    "Progress",
    "Loader",
  ]);
});

test("opens the sample sheet", async () => {
  await renderGallery();
  fireEvent.click(screen.getByRole("button", { name: "My limits" }));
  expect(screen.getByRole("dialog", { name: "My limits" })).toBeInTheDocument();
});

test("shows a sample toast", async () => {
  await renderGallery();
  fireEvent.click(screen.getByRole("button", { name: "Show success" }));
  expect(await screen.findByText("Share approved")).toBeInTheDocument();
});
