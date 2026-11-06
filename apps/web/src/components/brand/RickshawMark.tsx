import { cx } from "../../lib/cx";

/** The mark's outlines. public/brand/*.svg use the same paths, and brand-assets.test.ts checks it. */
export const RICKSHAW_PATHS = {
  hood: "M5 30C5 14 11 4 25 4H41C43 4 44.6 5.3 45.1 7.2L48.6 21H42.8L40.2 10.6C40 10 39.5 9.6 38.9 9.6H25C19 9.6 15.4 13 14.4 19L13.6 30Z",
  riders:
    "M22.5 13.4a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6ZM18 27v-2.6a4.5 4.5 0 0 1 9 0V27ZM32 13.4a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6ZM27.5 27v-2.6a4.5 4.5 0 0 1 9 0V27Z",
  body: "M4 30Q4 27 7 27H34Q37 27 38.4 24L40 20.5H49.5Q55.5 20.5 57.4 26.8L59.6 35Q60 37 57.81 37A8.2 8.2 0 0 0 42.19 37H25.77A9 9 0 0 0 8.23 37H4Z",
} as const;

const WHEELS = [
  { x: 17, y: 39, tire: 7, hub: 2.4 },
  { x: 50, y: 39.5, tire: 6.2, hub: 2.1 },
] as const;

export interface RickshawMarkProps {
  /** Hood, riders and wheels use currentColor: `text-ink` on light grounds, `text-card` on ink. */
  className?: string;
  /** Animation for the wheels. Spokes are drawn only then, so the static mark stays clean. */
  wheelClassName?: string;
}

export function RickshawMark({ className, wheelClassName }: RickshawMarkProps) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" focusable="false" className={className}>
      <path fill="currentColor" d={RICKSHAW_PATHS.hood} />
      <path fill="currentColor" d={RICKSHAW_PATHS.riders} />
      <path fill="var(--marigold)" d={RICKSHAW_PATHS.body} />
      <circle cx="54.6" cy="28" r="1.7" fill="var(--card)" />
      {WHEELS.map((wheel) => {
        const spoke = wheel.tire - 1.5;
        return (
          <g key={wheel.x} className={cx("origin-center [transform-box:fill-box]", wheelClassName)}>
            <circle cx={wheel.x} cy={wheel.y} r={wheel.tire} fill="currentColor" />
            {wheelClassName && (
              <path
                d={`M${wheel.x} ${wheel.y - spoke}V${wheel.y + spoke}M${wheel.x - spoke} ${wheel.y}H${wheel.x + spoke}`}
                stroke="var(--marigold)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            )}
            <circle cx={wheel.x} cy={wheel.y} r={wheel.hub} fill="var(--marigold)" />
          </g>
        );
      })}
    </svg>
  );
}
