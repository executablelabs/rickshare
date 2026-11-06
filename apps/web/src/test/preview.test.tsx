import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AppProviders } from "../providers";
import { createAppRouter } from "../router";

afterEach(() => vi.unstubAllGlobals());

test("development samples render without network calls and cannot trigger user actions", async () => {
  const connect = vi.fn();
  vi.stubGlobal(
    "EventSource",
    class {
      constructor() {
        connect();
      }
      addEventListener() {}
      close() {}
    },
  );
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Preview must not call the API"));
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/dev/trip"] }));
  await router.load();
  render(<AppProviders router={router} />);
  expect(await screen.findByText("Layout preview. Actions are disabled.")).toBeInTheDocument();
  expect((await screen.findByText("India 26")).closest("[inert]")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});
