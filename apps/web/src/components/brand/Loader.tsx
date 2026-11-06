import { RickshawMark } from "./RickshawMark";

export interface LoaderProps {
  /** Says what is loading, e.g. "Loading trip". Announced to screen readers. */
  label?: string;
}

export function Loader({ label = "Loading" }: LoaderProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-5 py-10">
      <div className="flex flex-col items-center">
        <RickshawMark
          className="w-14 text-ink animate-rickshaw-bob motion-reduce:animate-none"
          wheelClassName="animate-wheel-spin motion-reduce:animate-none"
        />
        <svg viewBox="0 0 64 2" aria-hidden="true" focusable="false" className="w-20 text-rule">
          <line
            x1="0"
            y1="1"
            x2="64"
            y2="1"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="8 6"
            className="animate-road motion-reduce:animate-none"
          />
        </svg>
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** Shown by the router while a route loads; it waits about a second first, so fast loads show nothing. */
export function RouteLoader() {
  return <Loader label="Loading" />;
}
