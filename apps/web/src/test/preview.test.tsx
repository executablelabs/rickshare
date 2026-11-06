import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../providers";
import { createAppRouter } from "../router";

test("development samples render without network calls and cannot trigger user actions", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Preview must not call the API"));
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/dev/trip"] }));
  await router.load();
  render(<AppProviders router={router} />);
  expect(await screen.findByText("Layout preview. Actions are disabled.")).toBeInTheDocument();
  expect((await screen.findByText("India 26")).closest("[inert]")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
