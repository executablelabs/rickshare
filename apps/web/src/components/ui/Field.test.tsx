import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Field } from "./Field";

test("labels the input and describes it with the hint", () => {
  render(<Field label="Trip name" hint="Up to 40 characters." />);
  const input = screen.getByLabelText("Trip name");
  expect(input).toHaveAccessibleDescription("Up to 40 characters.");
  expect(input).not.toHaveAttribute("aria-invalid");
});

test("keeps its own description and error state when the caller passes aria props", () => {
  render(
    <>
      <p id="limit-note">Limits apply per share.</p>
      <Field
        label="Amount"
        error="Enter an amount above $0."
        aria-describedby="limit-note"
        aria-invalid={false}
      />
    </>,
  );
  const input = screen.getByLabelText("Amount");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter an amount above $0. Limits apply per share.");
});

test("marks the input invalid and describes it with both hint and error", () => {
  render(<Field label="Amount" hint="In dollars." error="Enter an amount above $0." />);
  const input = screen.getByLabelText("Amount");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("In dollars. Enter an amount above $0.");
});
