import { cx } from "../../lib/cx";
import { RickshawMark } from "./RickshawMark";

export interface WordmarkProps {
  /** `ink` on light grounds; `card` on navy, where "share" turns marigold as DESIGN.md asks. */
  tone?: "ink" | "card";
  className?: string;
}

export function Wordmark({ tone = "ink", className }: WordmarkProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2.5 font-display text-xl font-semibold",
        tone === "card" ? "text-card" : "text-ink",
        className,
      )}
    >
      <RickshawMark className={cx("w-10", tone === "card" ? "text-card" : "text-ink")} />
      <span>
        Rick<span className={tone === "card" ? "text-marigold" : undefined}>share</span>
      </span>
    </span>
  );
}
