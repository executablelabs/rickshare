import { CalendarBlank, CaretRight } from "@phosphor-icons/react";
import type { Trip } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import type { Address } from "viem";
import { formatDay } from "../../lib/format-date";
import { memberOf } from "../../lib/trips";
import { Amount } from "../ui/Amount";
import { AvatarStack } from "../ui/AvatarStack";

export function TripCard({ trip, viewer }: { trip: Trip; viewer: Address | undefined }) {
  const me = memberOf(trip, viewer);
  const ended = new Date(trip.endsAt).getTime() < Date.now();
  return (
    <Link
      to="/trips/$tripId/plan"
      params={{ tripId: trip.id }}
      className="group flex flex-col gap-5 rounded-ticket border border-rule bg-card p-5 shadow-card ring-1 ring-transparent hover:ring-rule-strong motion-safe:transition-shadow motion-safe:duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-xl">{trip.name}</h3>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <CalendarBlank aria-hidden="true" size={16} />
            {ended ? `Ended ${formatDay(trip.endsAt)}` : `Ends ${formatDay(trip.endsAt)}`}
          </p>
        </div>
        <CaretRight
          aria-hidden="true"
          size={20}
          className="mt-1 shrink-0 text-ink-muted group-hover:text-ink"
        />
      </div>
      <div className="flex items-end justify-between gap-3">
        <AvatarStack members={trip.members} max={4} />
        {me && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-ink-muted">Your balance</span>
            <Amount value={BigInt(me.available)} display className="text-xl" />
          </div>
        )}
      </div>
    </Link>
  );
}
