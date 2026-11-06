import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Avatar, initialOf, memberTint } from "./Avatar";
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

test("gives a member the same tint whatever the address casing", () => {
  const address = "0xAbCdEf0000000000000000000000000000000001";
  expect(memberTint(address)).toBe(memberTint(address.toLowerCase()));
});

test("spreads members across tints", () => {
  const tints = new Set(members.map((member) => memberTint(member.address)));
  expect(tints.size).toBeGreaterThan(1);
});

test("tints an avatar by its color key, not its name", () => {
  render(<Avatar name="Angie" colorKey={members[1]?.address ?? ""} />);
  const avatar = screen.getByRole("img", { name: "Angie" });
  expect(avatar.className).toContain(memberTint(members[1]?.address ?? ""));
});

test("outlines overlapping avatars in navy on the header band", () => {
  render(<AvatarStack members={members} onInk />);
  const avatars = screen.getAllByRole("img", { name: /^(Angie|Bashy|Gitau)$/ });
  for (const avatar of avatars) expect(avatar.className).toContain("outline-ink");
});
