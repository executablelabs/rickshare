import { USDC_DECIMALS } from "@rickshare/shared";
import { formatUsd } from "./format-usd";

/**
 * Parses what a member typed as dollars ("12", "12.5", "1,200.75") into USDC base units exactly,
 * without floating point. Returns null for anything that is not a plain amount.
 */
export function parseUsd(input: string): bigint | null {
  const text = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  if (fraction.length > USDC_DECIMALS) return null;
  return (
    BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) +
    BigInt(fraction.padEnd(USDC_DECIMALS, "0") || "0")
  );
}

/** Base units back to an exact plain input value, e.g. 12500000n -> "12.50". */
export function toUsdInput(baseUnits: bigint): string {
  return formatUsd(baseUnits).replace("$", "").replace(/,/g, "");
}
