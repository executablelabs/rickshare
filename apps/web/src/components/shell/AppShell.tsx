import {
  ArrowUpRight,
  CalendarBlank,
  ChatsCircle,
  Coins,
  type Icon,
  MapPin,
  SignOut,
  SquaresFour,
} from "@phosphor-icons/react";
import type { Member } from "@rickshare/shared";
import { Link, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { BrandNav } from "../brand/BrandNav";
import { TravelStamp } from "../brand/Travel";
import { AvatarStack } from "../ui/AvatarStack";

type TripTabPath = "/trips/$tripId/plan" | "/trips/$tripId/itinerary" | "/trips/$tripId/money";
const tabs: Array<{ to: TripTabPath; label: string; icon: Icon }> = [
  { to: "/trips/$tripId/plan", label: "Plan", icon: ChatsCircle },
  { to: "/trips/$tripId/itinerary", label: "Itinerary", icon: CalendarBlank },
  { to: "/trips/$tripId/money", label: "Money", icon: Coins },
];
export interface AppShellProps {
  tripId: string;
  tripName?: string | undefined;
  tripEnsName?: string | null | undefined;
  tripLocation?: string | null | undefined;
  subtitle?: string | undefined;
  members?: Array<Pick<Member, "address" | "displayName">> | undefined;
  aside?: ReactNode;
  balance?: ReactNode;
  onSignOut?: (() => void) | undefined;
  children: ReactNode;
}

export function AppShell({
  tripId,
  tripName,
  tripEnsName,
  tripLocation,
  subtitle,
  members,
  aside,
  balance,
  onSignOut,
  children,
}: AppShellProps) {
  const match = useMatchRoute();
  const vehicle = match({ to: "/trips/$tripId/money", params: { tripId } })
    ? "plane"
    : match({ to: "/trips/$tripId/itinerary", params: { tripId } })
      ? "train"
      : "rickshaw";
  return (
    <div className="travel-shell">
      <header className="travel-shell__header">
        <BrandNav vehicle={vehicle}>
          <div className="travel-topbar__actions">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold hover:bg-card"
            >
              <SquaresFour size={20} aria-hidden="true" /> All trips
            </Link>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex size-11 items-center justify-center rounded-control hover:bg-card"
                aria-label="Sign out"
              >
                <SignOut size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </BrandNav>
        <div className="travel-shell__identity">
          <div className="min-w-0">
            <span className="travel-shell__eyebrow">Your next adventure</span>
            <p className="travel-shell__trip-name">
              {tripName ?? "Your trip"} <ArrowUpRight size={28} aria-hidden="true" />
            </p>
            <div className="travel-shell__details">
              {subtitle && (
                <div className="travel-shell__meta">
                  <CalendarBlank size={18} aria-hidden="true" />
                  <span>{subtitle}</span>
                </div>
              )}
              {tripLocation && (
                <div className="travel-shell__meta">
                  <MapPin size={18} aria-hidden="true" /> {tripLocation}
                </div>
              )}
            </div>
            {tripEnsName && <div className="travel-shell__ens">{tripEnsName}</div>}
            {balance}
          </div>
          <div className="travel-shell__passport">
            <TravelStamp vehicle={vehicle}>Going together</TravelStamp>
            {members && members.length > 0 && <AvatarStack members={members} onInk />}
          </div>
        </div>
        <nav aria-label="Trip" className="travel-nav">
          <ul>
            {tabs.map(({ to, label, icon: TabIcon }) => (
              <li key={to}>
                <Link to={to} params={{ tripId }}>
                  <span className="travel-nav__icon">
                    <TabIcon size={20} aria-hidden="true" />
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className={cx("travel-shell__body", !!aside && "travel-shell__body--aside")}>
        <main>{children}</main>
        {aside && (
          <aside className="travel-shell__aside" aria-label="Trip notebook">
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}
