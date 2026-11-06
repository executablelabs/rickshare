import { CalendarBlank, CaretRight, MapPin } from "@phosphor-icons/react";
import type { Trip } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import type { Address } from "viem";
import { formatDay, formatTripDates } from "../../lib/format-date";
import { memberOf } from "../../lib/trips";
import { TransportMark } from "../brand/TransportMark";
import { RouteDoodle } from "../landing/TravelDetails";
import { Amount } from "../ui/Amount";
import { AvatarStack } from "../ui/AvatarStack";

export function TripCard({ trip, viewer }: { trip: Trip; viewer: Address | undefined }) {
  const me = memberOf(trip, viewer);
  const ended = new Date(trip.endsAt).getTime() < Date.now();
  return (
    <Link to="/trips/$tripId/plan" params={{ tripId: trip.id }} className="travel-trip-card group">
      <div className="travel-trip-card__cover">
        <MapPin className="travel-trip-card__pin" size={22} weight="fill" aria-hidden="true" />
        <h3>{trip.name}</h3>
        <TransportMark vehicle="bus" />
        <RouteDoodle />
      </div>
      <div className="travel-trip-card__body">
        <p className="travel-trip-card__date">
          <CalendarBlank aria-hidden="true" size={16} />
          {trip.startsAt
            ? formatTripDates(trip.startsAt, trip.endsAt)
            : ended
              ? `Ended ${formatDay(trip.endsAt)}`
              : formatTripDates(null, trip.endsAt)}
        </p>
        {trip.location && (
          <p className="travel-trip-card__date">
            <MapPin aria-hidden="true" size={16} /> {trip.location}
          </p>
        )}
        <CaretRight
          aria-hidden="true"
          size={20}
          className="mt-1 shrink-0 text-ink-muted group-hover:text-ink"
        />
      </div>
      <div className="travel-trip-card__footer">
        <AvatarStack members={trip.members} max={4} />
        {me && (
          <div className="travel-trip-card__balance">
            <span className="text-xs text-ink-muted">Your balance</span>
            <Amount value={BigInt(me.available)} display className="text-xl" />
          </div>
        )}
      </div>
    </Link>
  );
}
