import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type ChipTone = "neutral" | "action" | "stamp" | "waiting" | "declined";

// Each tint is paired only with its own ink, which keeps every chip above 5:1 contrast.
const toneClasses: Record<ChipTone, string> = {
  neutral: "bg-card text-ink-muted ring-1 ring-inset ring-rule",
  action: "bg-coral-tint font-semibold text-coral-ink",
  stamp: "bg-stamp-tint font-semibold text-stamp-ink",
  waiting: "bg-marigold-tint font-semibold text-marigold-ink",
  declined: "bg-declined-tint font-semibold text-declined",
};

export interface ChipProps {
  /** `action` is for "Waiting for you": the one chip that asks the viewer to act. */
  tone?: ChipTone;
  children: ReactNode;
}

export function Chip({ tone = "neutral", children }: ChipProps) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-xs",
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
