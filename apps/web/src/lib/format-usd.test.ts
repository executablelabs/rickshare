import { expect, test } from "vitest";
import { formatUsd } from "./format-usd";

test.each([
  [0n, "$0.00"],
  [42_000_000n, "$42.00"],
  [84_500_000n, "$84.50"],
  [4_999n, "$0.004999"],
  [5_000n, "$0.005"],
  [10_004_999n, "$10.004999"],
  [1_234_567_891n, "$1,234.567891"],
  [1_000_000_000_000n, "$1,000,000.00"],
  [-42_000_000n, "-$42.00"],
  [-1n, "-$0.000001"],
])("formats %s base units as %s without rounding", (baseUnits, expected) => {
  expect(formatUsd(baseUnits)).toBe(expected);
});
