import { USDC_DECIMALS } from "@rickshare/shared";

const scale = 10n ** BigInt(USDC_DECIMALS);

/**
 * Formats USDC base units as dollars without floating point. Shows cents, plus any sub-cent
 * digits, and never rounds: a member must see exactly the amount they approve.
 */
export function formatUsd(baseUnits: bigint): string {
  const sign = baseUnits < 0n ? "-" : "";
  const magnitude = baseUnits < 0n ? -baseUnits : baseUnits;
  const dollars = (magnitude / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (magnitude % scale)
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${sign}$${dollars}.${fraction}`;
}
