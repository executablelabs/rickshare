import { expect, test } from "vitest";
import { parseUsd, toUsdInput } from "./usd-input";

test.each([
  ["50", 50_000_000n],
  ["12.5", 12_500_000n],
  ["$1,200.75", 1_200_750_000n],
  ["0.000001", 1n],
  [" 7 ", 7_000_000n],
])("parses %j exactly", (input, expected) => {
  expect(parseUsd(input)).toBe(expected);
});

test.each(["", "abc", "1.2.3", "-5", "0.0000001", "1e3"])("rejects %j", (input) => {
  expect(parseUsd(input)).toBeNull();
});

test("formats base units back without losing sub-cent digits", () => {
  expect(toUsdInput(12_500_000n)).toBe("12.50");
  expect(toUsdInput(28_333_333n)).toBe("28.333333");
  expect(toUsdInput(1_234_000_000n)).toBe("1234.00");
});
