import { Address, arcTestnet, UsdcAmount } from "@rickshare/shared";
import { formatUsd } from "../../lib/format-usd";
import { messageOf } from "../../lib/http";
import { type HistoryEvent, useHistory } from "../../lib/money";
import { useProposals } from "../../lib/plan";
import { Loader } from "../brand/Loader";
import { useTripActions } from "../trips/TripActions";
import { Button } from "../ui/Button";

const labels: Record<string, string> = {
  MemberJoined: "Joined the trip",
  PolicySet: "Updated automatic approval limits",
  Proposed: "Purchase proposed",
  ShareChanged: "Purchase share updated",
  Locked: "Purchase approved by everyone",
  Rejected: "Purchase declined",
  Fulfilled: "Ticket issued and merchant paid",
  Refunded: "Purchase released back to available balances",
  Settled: "Trip settled",
  Deposited: "Money added",
  Withdrawn: "Money withdrawn",
};

export function MoneyHistory() {
  const { trip } = useTripActions();
  const history = useHistory(trip.id);
  const proposals = useProposals(trip.id);
  const seen = new Set<string>();
  const events =
    history.data?.pages
      .flatMap((page) => page.events)
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      }) ?? [];
  function describe(event: HistoryEvent) {
    const actor = Address.safeParse(event.data.member);
    const member = actor.success
      ? trip.members.find((member) => member.address.toLowerCase() === actor.data.toLowerCase())
      : undefined;
    const amount = UsdcAmount.safeParse(event.data.amount);
    if (amount.success && (event.name === "Deposited" || event.name === "Withdrawn"))
      return `${member?.displayName ?? "A member"} ${event.name === "Deposited" ? "added" : "withdrew"} ${formatUsd(BigInt(amount.data))}`;
    return labels[event.name] ?? "Trip updated";
  }
  return (
    <section
      aria-labelledby="history-title"
      className="flex flex-col gap-3 rounded-ticket bg-card p-5 shadow-card"
    >
      <h2 id="history-title" className="font-display text-xl font-semibold">
        History
      </h2>
      {history.isPending ? (
        <Loader label="Loading history" />
      ) : (
        <>
          {events.length === 0 && !history.isError && (
            <p className="text-ink-muted">No money activity yet.</p>
          )}
          <ol aria-label="Money history" className="divide-y divide-rule">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-1 py-3">
                <p className="font-semibold wrap-anywhere">{describe(event)}</p>
                {event.proposalId && (
                  <p className="text-sm text-ink-muted wrap-anywhere">
                    {proposals.data?.find((proposal) => proposal.id === event.proposalId)?.title ??
                      `Purchase #${event.proposalId}`}
                  </p>
                )}
                <details className="text-sm text-ink-muted">
                  <summary className="flex min-h-11 cursor-pointer items-center underline">
                    Transaction details
                  </summary>
                  <p>Block {event.blockNumber}</p>
                  <a
                    href={`${arcTestnet.blockExplorers.default.url}/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-stamp-ink underline"
                  >
                    View transaction
                  </a>
                </details>
              </li>
            ))}
          </ol>
          {history.isError && (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p>{messageOf(history.error)}</p>
              <Button
                variant="secondary"
                onClick={() =>
                  void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())
                }
              >
                Try again
              </Button>
            </div>
          )}
          {history.hasNextPage && !history.isError && (
            <Button
              variant="secondary"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? "Loading more…" : "Load older activity"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
