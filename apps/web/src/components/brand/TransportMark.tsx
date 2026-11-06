import { RickshawMark } from "./RickshawMark";
import { TrainMark } from "./TrainMark";
import "./transport-mark.css";

export type Vehicle = "rickshaw" | "bus" | "train" | "plane";

const vehicles: Vehicle[] = ["rickshaw", "bus", "train", "plane"];

/** Shared 64 × 48 geometry, hood weight, round windows and marigold body of the original mark. */
function VehicleDrawing({ vehicle }: { vehicle: Exclude<Vehicle, "rickshaw"> }) {
  if (vehicle === "train") return <TrainMark />;
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      {vehicle === "bus" && (
        <>
          <path fill="currentColor" d="M5 29V14Q5 5 14 5H45Q53 5 55 13L59 29V37H5Z" />
          <path fill="var(--marigold)" d="M5 27H59V37H5Z" />
          <rect x="11" y="11" width="9" height="12" rx="3" fill="var(--card)" />
          <rect x="25" y="11" width="9" height="12" rx="3" fill="var(--card)" />
          <path fill="var(--card)" d="M39 11H45Q48 11 49 15L51 23H39Z" />
          <rect x="52" y="29" width="5" height="3" rx="1.5" fill="var(--card)" />
          <circle cx="17" cy="39" r="7" fill="currentColor" />
          <circle cx="50" cy="39" r="7" fill="currentColor" />
          <circle cx="17" cy="39" r="2.4" fill="var(--marigold)" />
          <circle cx="50" cy="39" r="2.4" fill="var(--marigold)" />
        </>
      )}
      {vehicle === "plane" && (
        <>
          <path
            fill="currentColor"
            d="M5 11Q4 8 7 8H12Q14 8 15 10L22 20H29L24 7Q23 4 26 4H30Q32 4 34 6L46 20H50Q57 20 61 26Q63 30 59 33L36 35L28 44H21L25 35H14Q9 35 8 30Z"
          />
          <path
            fill="var(--marigold)"
            d="M10 23H49Q54 23 57 27Q59 29 56 30L33 32H14Q12 32 12 29Z"
          />
          <path fill="var(--card)" d="M48 23H51Q55 23 57 27H49Z" />
          <rect x="20" y="24" width="4" height="4" rx="1.8" fill="currentColor" />
          <rect x="28" y="24" width="4" height="4" rx="1.8" fill="currentColor" />
          <rect x="36" y="24" width="4" height="4" rx="1.8" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** All states keep the same footprint; CSS crossfades them without moving the wordmark. */
export function TransportMark({ vehicle }: { vehicle: Vehicle }) {
  return (
    <span className="transport-mark" data-vehicle={vehicle} aria-hidden="true">
      {vehicles.map((kind) => (
        <span key={kind} className="transport-mark__state" data-active={kind === vehicle}>
          {kind === "rickshaw" ? <RickshawMark /> : <VehicleDrawing vehicle={kind} />}
        </span>
      ))}
    </span>
  );
}
