import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SUCCESS_TOAST_MS, ToastProvider, useToast } from "./Toast";

function Trigger({ message, tone }: { message: string; tone: "success" | "error" }) {
  const show = useToast();
  return (
    <button type="button" onClick={() => show(message, { tone })}>
      Show
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("announces a success toast and removes it after the timeout", () => {
  render(
    <ToastProvider>
      <Trigger message="Share approved" tone="success" />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(screen.getByRole("status")).toHaveTextContent("Share approved");

  act(() => {
    vi.advanceTimersByTime(SUCCESS_TOAST_MS);
  });
  expect(screen.queryByText("Share approved")).not.toBeInTheDocument();
});

test("keeps an error toast until it is dismissed", () => {
  const message = "Your verification expired. Approve again to retry.";
  render(
    <ToastProvider>
      <Trigger message={message} tone="error" />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show" }));

  act(() => {
    vi.advanceTimersByTime(SUCCESS_TOAST_MS * 3);
  });
  expect(screen.getByText(message)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

test("fails loudly when used outside the provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Trigger message="Share approved" tone="success" />)).toThrow(
    "useToast must be used inside ToastProvider.",
  );
});
