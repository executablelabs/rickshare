import { USDC_DECIMALS } from "./chains";

const scale = 10n ** BigInt(USDC_DECIMALS);

export function parseUsdc(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("Enter a non-negative decimal USDC amount.");
  }

  const [whole = "0", fraction = ""] = value.split(".");
  const fractionalUnits = BigInt(fraction.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0"));
  // Round half up at the token's precision without passing through floating point.
  const roundUp = (fraction[USDC_DECIMALS] ?? "0") >= "5";
  return BigInt(whole) * scale + fractionalUnits + (roundUp ? 1n : 0n);
}

export function formatUsdc(value: bigint): string {
  if (value < 0n) {
    throw new Error("USDC amounts cannot be negative.");
  }

  return `${value / scale}.${(value % scale).toString().padStart(USDC_DECIMALS, "0")}`;
}
