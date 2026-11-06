import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SPLASH_SEEN_KEY, Splash } from "./Splash";

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

function preferReducedMotion() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

test("plays on the first load of a session and remembers it", () => {
  render(<Splash />);
  expect(screen.getByTestId("splash")).toHaveTextContent("Rickshare");
  expect(window.sessionStorage.getItem(SPLASH_SEEN_KEY)).toBe("1");
});

test("does not play again in the same session", () => {
  window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  render(<Splash />);
  expect(screen.queryByTestId("splash")).not.toBeInTheDocument();
});

test("unmounts when its own fade ends, not when an inner animation ends", () => {
  render(<Splash />);
  const splash = screen.getByTestId("splash");
  fireEvent.animationEnd(screen.getByText("share"));
  expect(splash).toBeInTheDocument();
  fireEvent.animationEnd(splash);
  expect(screen.queryByTestId("splash")).not.toBeInTheDocument();
});

test("is skipped under reduced motion without using up the session", () => {
  preferReducedMotion();
  render(<Splash />);
  expect(screen.queryByTestId("splash")).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(SPLASH_SEEN_KEY)).toBeNull();
});
