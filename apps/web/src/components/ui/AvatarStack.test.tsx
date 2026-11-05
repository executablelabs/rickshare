import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { initialOf } from "./Avatar";
import { AvatarStack, listNames } from "./AvatarStack";

const members = ["Angie", "Bashy", "Gitau", "Wanjiru"].map((displayName, index) => ({
  address: `0x${String(index + 1).padStart(40, "0")}`,
  displayName,
}));

test("names everyone in the accessible label, including hidden members", () => {
  render(<AvatarStack members={members} max={3} />);
  expect(screen.getByRole("img", { name: "Angie, Bashy, Gitau and Wanjiru" })).toBeInTheDocument();
  expect(screen.getByText("+1")).toBeInTheDocument();
});

test.each([0, -1])("always shows at least one avatar when max is %i", (max) => {
  render(<AvatarStack members={members} max={max} />);
  expect(screen.getByText("+3")).toBeInTheDocument();
});

test("shows no overflow count when everyone fits", () => {
  render(<AvatarStack members={members.slice(0, 2)} />);
  expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
});

test.each([
  [[], ""],
  [["Angie"], "Angie"],
  [["Angie", "Bashy"], "Angie and Bashy"],
])("lists %j as %s", (names, expected) => {
  expect(listNames(names)).toBe(expected);
});

test.each([
  ["angie", "A"],
  ["  bashy", "B"],
  ["Émile", "É"],
  ["", "?"],
])("uses the first letter of %j", (name, expected) => {
  expect(initialOf(name)).toBe(expected);
});
