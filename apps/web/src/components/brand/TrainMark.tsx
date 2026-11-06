/** Electric Express: the chosen wheel-free train in the Rickshare transport family. */
export function TrainMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M7 3H56M24 13L31 6L38 13M31 6L35 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path fill="currentColor" d="M4 21Q4 13 12 13H39Q46 13 50 21L60 34Q63 41 55 41H4Z" />
      <path fill="var(--marigold)" d="M4 29H55L59 35Q61 37 56 37H4Z" />
      <rect x="10" y="19" width="8" height="8" rx="2.5" fill="var(--card)" />
      <rect x="24" y="19" width="8" height="8" rx="2.5" fill="var(--card)" />
      <path fill="var(--card)" d="M39 19Q43 19 46 24L49 28H39Z" />
      <rect x="52" y="31" width="4" height="2.5" rx="1.2" fill="var(--card)" />
    </svg>
  );
}
