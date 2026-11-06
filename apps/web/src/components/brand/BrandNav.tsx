import type { ReactNode } from "react";
import type { Vehicle } from "./TransportMark";
import { Wordmark } from "./Wordmark";
import "../../styles/travel.css";

export function BrandNav({
  vehicle,
  children,
  homeHref = "/",
  className = "",
}: {
  vehicle: Vehicle;
  children: ReactNode;
  homeHref?: string;
  className?: string;
}) {
  return (
    <div className={`travel-topbar ${className}`}>
      <a href={homeHref} aria-label="Rickshare home" className="brand-nav__brand">
        <Wordmark vehicle={vehicle} />
      </a>
      {children}
    </div>
  );
}
