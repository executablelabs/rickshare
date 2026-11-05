import { cx } from "../../lib/cx";
import { formatUsd } from "../../lib/format-usd";

export interface AmountProps {
  /** USDC base units (6 decimals). */
  value: bigint;
  /** Large amounts use the display face. */
  display?: boolean;
  className?: string;
}

export function Amount({ value, display = false, className }: AmountProps) {
  return (
    <span className={cx("tabular-nums", display && "font-display font-semibold", className)}>
      {formatUsd(value)}
    </span>
  );
}
