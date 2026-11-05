import { expect, test } from "vitest";
import { formatUsd } from "./format-usd";

test.each([
  [0n, "$0.00"],
  [42_000_000n, "$42.00"],
  [84_500_000n, "$84.50"],
  [4_999n, "$0.00"],
  [5_000n, "$0.01"],
  [1_234_567_891n, "$1,234.57"],
  [1_000_000_000_000n, "$1,000,000.00"],
  [-42_000_000n, "-$42.00"],
])("formats %s base units as %s", (baseUnits, expected) => {
  expect(formatUsd(baseUnits)).toBe(expected);
});
