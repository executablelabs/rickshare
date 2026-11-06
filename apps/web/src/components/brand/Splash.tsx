import { useEffect, useState } from "react";
import { useMediaQuery } from "../../lib/use-media-query";
import { RickshawMark } from "./RickshawMark";

export const SPLASH_SEEN_KEY = "rickshare.splash-seen";

function seenThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_SEEN_KEY) !== null;
  } catch {
    // Storage can be blocked, e.g. in some private windows. Playing the splash again is harmless.
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Same as above: without storage the splash simply plays on every load.
  }
}

/**
 * The brand moment from DESIGN.md: once per session the rickshaw drives in, parks at the start of
 * the name and pulls it into view, then the overlay fades. It is pure CSS, so a slow device sees
 * the same timing, and it unmounts when its fade ends.
 */
export function Splash() {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [visible, setVisible] = useState(() => !seenThisSession());
  const playing = visible && !reducedMotion;

  useEffect(() => {
    if (playing) markSeen();
  }, [playing]);

  if (!playing) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="splash"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink animate-splash-exit"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setVisible(false);
      }}
    >
      <div className="relative">
        <span className="block whitespace-nowrap pr-[calc(5rem+12px)] font-display text-3xl font-semibold text-card animate-splash-reveal">
          Rick<span className="text-marigold">share</span>
        </span>
        <RickshawMark
          className="absolute top-1/2 left-0 w-20 -translate-y-1/2 text-card animate-splash-drive"
          wheelClassName="animate-splash-wheels"
        />
      </div>
    </div>
  );
}
