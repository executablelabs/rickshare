import { describe, expect, test } from "bun:test";
import { formatUsdc, parseUsdc } from "./money";

describe("USDC amounts", () => {
  test("parses six-decimal token units exactly, including amounts beyond Number precision", () => {
    expect(parseUsdc("0")).toBe(0n);
    expect(parseUsdc("42.12")).toBe(42_120_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(parseUsdc("9007199254740993.123456")).toBe(9_007_199_254_740_993_123_456n);
  });

  test("rounds half up at six decimals, including carry into the whole amount", () => {
    expect(parseUsdc("1.1234564")).toBe(1_123_456n);
    expect(parseUsdc("1.1234565")).toBe(1_123_457n);
    expect(parseUsdc("0.0000005")).toBe(1n);
    expect(parseUsdc("9.9999999")).toBe(10_000_000n);
  });

  test.each([
    "",
    " ",
    " 1",
    "1 ",
    "-1",
    "+1",
    "1e6",
    "NaN",
    "Infinity",
    ".5",
    "1.",
    "1,000",
    "1.2.3",
  ])("rejects invalid decimal input: %s", (value) => expect(() => parseUsdc(value)).toThrow());

  test("formats losslessly with six decimal places", () => {
    expect(formatUsdc(0n)).toBe("0.000000");
    expect(formatUsdc(1n)).toBe("0.000001");
    expect(formatUsdc(42_120_000n)).toBe("42.120000");
    const large = 9_007_199_254_740_993_123_456n;
    expect(parseUsdc(formatUsdc(large))).toBe(large);
    expect(() => formatUsdc(-1n)).toThrow();
  });
});
