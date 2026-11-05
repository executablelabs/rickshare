import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Button } from "./Button";

test("defaults to a non-submitting button so it never submits a surrounding form", () => {
  render(<Button>Add money</Button>);
  expect(screen.getByRole("button", { name: "Add money" })).toHaveAttribute("type", "button");
});

test("calls onClick and respects disabled", () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>Approve my share</Button>);
  fireEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(
    <Button onClick={onClick} disabled>
      Approve my share
    </Button>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(1);
});
