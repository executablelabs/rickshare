import { MapPin } from "@phosphor-icons/react";
import type { ItineraryItem } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import { useWallet } from "../../auth/wallet";
import { formatDay } from "../../lib/format-date";
import { useItinerary } from "../../lib/itinerary";
import { useProposals } from "../../lib/plan";
import { Loader } from "../brand/Loader";
import { TravelError, TravelIntro } from "../brand/Travel";
import { RouteDoodle, TapeLabel } from "../brand/TravelDetails";
import { TicketLink } from "../plan/Feed";
import { useTripActions } from "../trips/TripActions";
import { AvatarStack } from "../ui/AvatarStack";
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
      <TravelIntro
        title="Itinerary"
        description="The days you’ll talk about. All in one place."
        vehicle="train"
      />
      {itinerary.isPending || proposals.isPending ? (
        <Loader label="Loading itinerary" />
      ) : itinerary.isError || proposals.isError ? (
        <TravelError
          error={itinerary.error ?? proposals.error}
          onRetry={() => {
            void itinerary.refetch();
            void proposals.refetch();
          }}
        />
      ) : items.length === 0 ? (
        <section className="travel-empty flex flex-col items-start gap-4">
          <TapeLabel>Good days ahead</TapeLabel>
          <RouteDoodle />
          <h2 className="font-display text-xl font-semibold">No plans yet</h2>
          <p className="text-ink-muted">
            Ask the planner for ideas. Your days and booked tickets will appear here.
          </p>
          <Link
            to="/trips/$tripId/plan"
            params={{ tripId: trip.id }}
            className="inline-flex min-h-12 items-center justify-center rounded-control bg-ink px-5 font-semibold text-card hover:bg-ink-hover"
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
            className="travel-day"
          >
            <h2>{formatDay(day.startsAt)}</h2>
            <ol>
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
                      className={`travel-activity ${status === "fulfilled" ? "travel-activity--booked" : ""}`}
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
                      <div className="travel-activity__body">
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
                        {proposal && (
                          <AvatarStack
                            members={trip.members.filter((member) =>
                              proposal.shares.some(
                                (share) =>
                                  share.member.toLowerCase() === member.address.toLowerCase(),
                              ),
                            )}
                          />
                        )}
                        {proposal &&
                          status === "fulfilled" &&
                          (mine ? (
                            <TicketLink proposal={proposal} />
                          ) : (
                            <p className="text-sm text-ink-muted">
                              You’re not part of this booking.
                            </p>
                          ))}
                      </div>
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
