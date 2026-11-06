import { TransportMark, type Vehicle } from "../brand/TransportMark";
import { landingStops } from "./useLandingJourney";
import "./journey-indicator.css";

export function JourneyIndicator({ vehicle }: { vehicle: Vehicle }) {
  return (
    <nav className="journey-indicator" aria-label="Page journey" data-vehicle={vehicle}>
      <div className="journey-indicator__track">
        <span className="journey-indicator__position" aria-hidden="true">
          <TransportMark vehicle={vehicle} />
        </span>
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
      </div>
    </nav>
  );
}
