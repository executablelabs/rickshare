import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type ChipTone = "neutral" | "stamp" | "waiting" | "declined";

const toneClasses: Record<ChipTone, string> = {
  neutral: "text-ink-muted ring-rule",
  stamp: "text-stamp ring-stamp",
  // Marigold is never used for text on white, so the waiting chip keeps ink text.
  waiting: "text-ink ring-marigold",
  declined: "text-declined ring-declined",
};

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
}

export function Chip({ tone = "neutral", children }: ChipProps) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-pill bg-card px-3 text-xs ring-1 ring-inset",
        toneClasses[tone],
      )}
    >
      {tone === "waiting" && (
        <span aria-hidden="true" className="size-2 rounded-pill bg-marigold" />
      )}
      {children}
    </span>
  );
}
