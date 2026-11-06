import { ArrowUpRight, MapPin } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import { TransportMark, type Vehicle } from "./TransportMark";
import "./travel-details.css";

export function Postcard({
  className = "",
  message = (
    <>
      Meet you in
      <br />
      Mumbai.
    </>
  ),
}: {
  className?: string;
  message?: ReactNode;
}) {
  return (
    <div className={`travel-postcard ${className}`} aria-hidden="true">
      <div className="travel-postcard__photo">
        <img
          src="https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=85"
          alt=""
          width="600"
          height="420"
          loading="lazy"
        />
        <span>{message}</span>
      </div>
      <div className="travel-postcard__caption">
        <span>A little further, together.</span>
        <ArrowUpRight size={18} />
      </div>
    </div>
  );
}

export function RouteDoodle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`travel-route ${className}`}
      viewBox="0 0 240 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 110C53 115 24 38 84 47C145 57 79 118 132 112C187 105 157 13 219 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="110" r="4" fill="currentColor" />
      <path d="M211 9L227 19L211 27L214 19Z" fill="currentColor" />
    </svg>
  );
}

export function DestinationStamp() {
  return (
    <div className="destination-stamp" aria-hidden="true">
      <MapPin size={24} weight="duotone" />
      <strong>Go places.</strong>
      <span>With your people.</span>
    </div>
  );
}

export function TapeLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`travel-tape ${className}`}>{children}</span>;
}

/** Shared route geometry for the landing navigation and the trip's readiness stops. */
export function JourneyTrack({
  vehicle,
  current,
  count,
  children,
  className = "",
}: {
  vehicle: Vehicle;
  current: number;
  count: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`journey-track ${className}`}
      style={{ "--journey-current": current, "--journey-count": count } as CSSProperties}
    >
      <span className="journey-track__vehicle" aria-hidden="true">
        <TransportMark vehicle={vehicle} />
      </span>
      {children}
    </div>
  );
}
