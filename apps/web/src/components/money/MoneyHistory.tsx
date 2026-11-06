import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle,
  FlagCheckered,
  Receipt,
  SlidersHorizontal,
  Ticket,
  Users,
  XCircle,
} from "@phosphor-icons/react";
import { Address, arcTestnet, UsdcAmount } from "@rickshare/shared";
import { useWallet } from "../../auth/wallet";
import { formatUsd } from "../../lib/format-usd";
import { messageOf } from "../../lib/http";
import { type HistoryEvent, useHistory } from "../../lib/money";
import { useProposals } from "../../lib/plan";
import { Loader } from "../brand/Loader";
import { useTripActions } from "../trips/TripActions";
import { displayNameOf } from "../ui/Avatar";
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

const icons: Record<string, typeof Receipt> = {
  MemberJoined: Users,
  PolicySet: SlidersHorizontal,
  Proposed: Receipt,
  ShareChanged: SlidersHorizontal,
  Locked: CheckCircle,
  Rejected: XCircle,
  Fulfilled: Ticket,
  Refunded: ArrowCounterClockwise,
  Settled: FlagCheckered,
  Deposited: ArrowDown,
  Withdrawn: ArrowUp,
};

export function MoneyHistory() {
  const { trip } = useTripActions();
  const wallet = useWallet();
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
    const isYou = actor.success && actor.data.toLowerCase() === wallet.address?.toLowerCase();
    const name = displayNameOf(member?.displayName ?? "");
    const actorName = isYou && name !== member?.displayName ? "You" : name;
    const amount = UsdcAmount.safeParse(event.data.amount);
    if (amount.success && (event.name === "Deposited" || event.name === "Withdrawn"))
      return `${actorName} ${event.name === "Deposited" ? "added" : "withdrew"} ${formatUsd(BigInt(amount.data))}`;
    if (isYou && event.name === "PolicySet") return "Updated your limits";
    return labels[event.name] ?? "Trip updated";
  }
  return (
    <section aria-labelledby="history-title" className="travel-receipts flex flex-col gap-4">
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
            {events.map((event) => {
              const Icon = icons[event.name] ?? Receipt;
              return (
                <li key={event.id} className="flex items-start gap-3 py-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-paper text-ink"
                    aria-hidden="true"
                  >
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold wrap-anywhere">{describe(event)}</p>
                    {event.proposalId && (
                      <p className="text-sm text-ink-muted wrap-anywhere">
                        {proposals.data?.find((proposal) => proposal.id === event.proposalId)
                          ?.title ?? `Purchase #${event.proposalId}`}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-ink-muted">Block {event.blockNumber}</p>
                  </div>
                  <a
                    href={`${arcTestnet.blockExplorers.default.url}/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View transaction"
                    title="View transaction"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-paper"
                  >
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
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
