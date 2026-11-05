import { USDC_DECIMALS } from "@kitty/shared";

const baseUnitsPerCent = 10n ** BigInt(USDC_DECIMALS - 2);

/** Formats USDC base units as dollars, rounding half up to the cent without floating point. */
export function formatUsd(baseUnits: bigint): string {
  const sign = baseUnits < 0n ? "-" : "";
  const magnitude = baseUnits < 0n ? -baseUnits : baseUnits;
  const totalCents = (magnitude + baseUnitsPerCent / 2n) / baseUnitsPerCent;
  const dollars = (totalCents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (totalCents % 100n).toString().padStart(2, "0");
  return `${sign}$${dollars}.${cents}`;
}
