import type { Vehicle } from "../brand/TransportMark";
import { JourneyTrack } from "../brand/TravelDetails";
import { landingStops } from "./useLandingJourney";
import "./journey-indicator.css";

export function JourneyIndicator({ vehicle }: { vehicle: Vehicle }) {
  return (
    <nav className="journey-indicator" aria-label="Page journey" data-vehicle={vehicle}>
      <JourneyTrack
        vehicle={vehicle}
        current={landingStops.findIndex((stop) => stop.vehicle === vehicle)}
        count={landingStops.length}
        className="journey-indicator__track"
      >
        {landingStops.map((stop, index) => (
          <a
            key={stop.id}
            href={`#${stop.id}`}
            className="journey-indicator__stop"
            aria-label={`${stop.label}, section ${index + 1} of 4`}
            aria-current={stop.vehicle === vehicle ? "location" : undefined}
          >
            <span className="sr-only">Go to {stop.label}</span>
            <span className="journey-indicator__dot" aria-hidden="true" />
          </a>
        ))}
      </JourneyTrack>
    </nav>
  );
}
