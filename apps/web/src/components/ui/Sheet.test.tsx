import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Sheet } from "./Sheet";

test("renders an accessible dialog named by its title when open", () => {
  render(
    <Sheet
      open
      onOpenChange={() => {}}
      title="My limits"
      description="Set what can be approved for you."
    >
      <p>Sheet body</p>
    </Sheet>,
  );
  const dialog = screen.getByRole("dialog", { name: "My limits" });
  expect(dialog).toHaveAccessibleDescription("Set what can be approved for you.");
  expect(screen.getByText("Sheet body")).toBeInTheDocument();
});

test("renders nothing when closed", () => {
  render(
    <Sheet open={false} onOpenChange={() => {}} title="My limits">
      <p>Sheet body</p>
    </Sheet>,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("asks to close from the close button", () => {
  const onOpenChange = vi.fn();
  render(
    <Sheet open onOpenChange={onOpenChange} title="Add money">
      <p>Sheet body</p>
    </Sheet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
