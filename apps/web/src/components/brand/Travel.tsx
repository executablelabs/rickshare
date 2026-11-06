import { ArrowUpRight, Compass, MapPin } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { messageOf } from "../../lib/http";
import { Button } from "../ui/Button";
import { TransportMark, type Vehicle } from "./TransportMark";
import { Postcard, RouteDoodle, TapeLabel } from "./TravelDetails";
import "../../styles/travel.css";

export function TravelArt({
  vehicle = "plane",
  photo = false,
}: {
  vehicle?: Vehicle;
  photo?: boolean;
}) {
  return (
    <div className={`travel-art ${photo ? "travel-art--photo" : ""}`} aria-hidden="true">
      <RouteDoodle />
      {photo ? (
        <Postcard
          className="travel-art__card"
          message={
            <>
              Good days
              <br />
              ahead.
            </>
          }
        />
      ) : (
        <div className="travel-art__card">
          <div className="travel-art__sky">
            <TransportMark vehicle={vehicle} />
            <span>
              A little further,
              <br />
              together.
            </span>
          </div>
          <div className="travel-art__caption">
            <span>Good company. Great adventures.</span>
            <ArrowUpRight size={18} />
          </div>
        </div>
      )}
      <div className="travel-art__stamp">
        <TransportMark vehicle={vehicle} />
        <span>
          Go places.
          <br />
          With your people.
        </span>
      </div>
    </div>
  );
}

export function TravelStamp({
  children,
  vehicle = "plane",
}: {
  children: ReactNode;
  vehicle?: Vehicle;
}) {
  return (
    <span className="travel-stamp">
      <TransportMark vehicle={vehicle} />
      <span>{children}</span>
    </span>
  );
}

export function TravelIntro({
  title,
  description,
  vehicle,
  tone = "paper",
}: {
  title: string;
  description: string;
  vehicle: Vehicle;
  tone?: "paper" | "navy";
}) {
  return (
    <div className={`travel-intro travel-intro--${tone}`}>
      <div>
        <p className="travel-kicker">
          <Compass size={18} aria-hidden="true" /> Your trip notebook
        </p>
        <h1>{title}</h1>
        <p className="travel-intro__description">{description}</p>
      </div>
      <div className="travel-intro__mark" aria-hidden="true">
        <TransportMark vehicle={vehicle} />
        <MapPin size={18} />
      </div>
    </div>
  );
}

export function TravelError({
  error,
  onRetry,
  title = "Lost signal somewhere along the way",
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div role="alert" className="travel-notice">
      <TapeLabel>A quick detour</TapeLabel>
      <h2>{title}</h2>
      <p>We couldn’t load this part of your trip. Try again in a moment.</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
      <details>
        <summary>What happened</summary>
        <p>{messageOf(error)}</p>
      </details>
    </div>
  );
}
