import { cx } from "../../lib/cx";
import { RickshawMark } from "./RickshawMark";
import { TransportMark, type Vehicle } from "./TransportMark";

export interface WordmarkProps {
  /** `ink` on light grounds; `card` on navy, where "share" turns marigold as DESIGN.md asks. */
  tone?: "ink" | "card";
  className?: string;
  /** Selects the shared transport family for the current journey stop. */
  vehicle?: Vehicle;
}

export function Wordmark({ tone = "ink", className, vehicle }: WordmarkProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2.5 font-display text-xl font-semibold",
        tone === "card" ? "text-card" : "text-ink",
        className,
      )}
    >
      {vehicle ? (
        <TransportMark vehicle={vehicle} />
      ) : (
        <RickshawMark className={cx("w-10", tone === "card" ? "text-card" : "text-ink")} />
      )}
      <span>
        Rick<span className={tone === "card" ? "text-marigold" : undefined}>share</span>
      </span>
    </span>
  );
}
