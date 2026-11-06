import { MapPin } from "@phosphor-icons/react";
import type { ItineraryItem } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import { useWallet } from "../../auth/wallet";
import { messageOf } from "../../lib/http";
import { useItinerary } from "../../lib/itinerary";
import { useProposals } from "../../lib/plan";
import { Loader } from "../brand/Loader";
import { TicketLink } from "../plan/Feed";
import { useTripActions } from "../trips/TripActions";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

export function Itinerary() {
  const { trip } = useTripActions();
  const wallet = useWallet();
  const itinerary = useItinerary(trip.id);
  const proposals = useProposals(trip.id);
  const items = [...(itinerary.data ?? [])];
  // A paid booking stays accessible even if the planner has not added it to its outline.
  for (const proposal of proposals.data ?? [])
    if (proposal.status === "fulfilled" && !items.some((item) => item.proposalId === proposal.id))
      items.push({
        ...proposal,
        id: `booking:${proposal.id}`,
        proposalId: proposal.id,
        ticketUrls: [],
      });
  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  const days = new Map<string, { startsAt: string; items: ItineraryItem[] }>();
  for (const item of items) {
    const date = new Date(item.startsAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const day = days.get(key) ?? { startsAt: item.startsAt, items: [] };
    day.items.push(item);
    days.set(key, day);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-rule pb-6">
        <h1 className="font-display text-3xl font-semibold">Itinerary</h1>
        <p className="text-ink-muted">
          Your days together, with plans and booked tickets in one place.
        </p>
      </div>
      {itinerary.isPending || proposals.isPending ? (
        <Loader label="Loading itinerary" />
      ) : itinerary.isError || proposals.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-ticket bg-card p-5 shadow-card"
        >
          <p>{messageOf(itinerary.error ?? proposals.error)}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void itinerary.refetch();
              void proposals.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-ticket border border-rule bg-card p-6 shadow-card">
          <h2 className="font-display text-xl font-semibold">No plans yet</h2>
          <p className="text-ink-muted">
            Ask the planner for ideas. Your days and booked tickets will appear here.
          </p>
          <Link
            to="/trips/$tripId/plan"
            params={{ tripId: trip.id }}
            className="inline-flex min-h-11 items-center font-semibold text-stamp-ink underline"
          >
            Ask the planner
          </Link>
        </section>
      ) : (
        [...days].map(([key, day]) => (
          <section
            key={key}
            aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(
              new Date(day.startsAt),
            )}
            className="flex flex-col gap-3"
          >
            <h2 className="self-start rounded-control bg-brand-sky px-3 py-2 font-display text-lg font-semibold">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "numeric",
                month: "short",
              }).format(new Date(day.startsAt))}
            </h2>
            <ol className="flex flex-col gap-4 border-l-2 border-rule pl-4">
              {day.items.map((item) => {
                const proposal = proposals.data.find((proposal) => proposal.id === item.proposalId);
                const mine = proposal?.shares.some(
                  (share) => share.member.toLowerCase() === wallet.address?.toLowerCase(),
                );
                const status = proposal?.status;
                return (
                  <li key={item.id}>
                    <article
                      aria-label={item.title}
                      className="flex flex-col gap-3 rounded-ticket border border-rule bg-card p-5 shadow-card"
                    >
                      <time
                        dateTime={item.startsAt}
                        className="text-sm font-semibold text-ink-muted"
                      >
                        {new Intl.DateTimeFormat(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(item.startsAt))}
                      </time>
                      <h3 className="font-display text-xl font-semibold wrap-anywhere">
                        {item.title}
                      </h3>
                      {item.location && (
                        <p className="flex items-start gap-1.5 text-sm text-ink-muted wrap-anywhere">
                          <MapPin aria-hidden="true" size={20} className="shrink-0" />
                          {item.location}
                        </p>
                      )}
                      <div>
                        <Chip
                          tone={
                            status === "fulfilled"
                              ? "stamp"
                              : status === "rejected"
                                ? "declined"
                                : "neutral"
                          }
                        >
                          {status === "fulfilled"
                            ? "Booked"
                            : status === "rejected"
                              ? "Declined"
                              : status === "refunded"
                                ? "Refunded"
                                : status === "locked"
                                  ? "Waiting for ticket"
                                  : "Planned"}
                        </Chip>
                      </div>
                      {proposal &&
                        status === "fulfilled" &&
                        (mine ? (
                          <TicketLink proposal={proposal} />
                        ) : (
                          <p className="text-sm text-ink-muted">You’re not part of this booking.</p>
                        ))}
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
