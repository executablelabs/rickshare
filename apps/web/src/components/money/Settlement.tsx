import { FlagCheckered } from "@phosphor-icons/react";
import type { Proposal } from "@rickshare/shared";
import { useState } from "react";
import { formatWhen } from "../../lib/format-date";
import { useProposals } from "../../lib/plan";
import { useMoney } from "../../lib/trips";
import { TapeLabel } from "../brand/TravelDetails";
import { useMoneyFlow } from "../trips/MoneySheets";
import { useTripActions } from "../trips/TripActions";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Steps } from "../ui/Steps";
import { useToast } from "../ui/Toast";

function ReleaseHold({ proposal }: { proposal: Proposal }) {
  const { trip } = useTripActions();
  const { runner, run, pending } = useMoneyFlow(trip);
  const showToast = useToast();
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <p className="font-semibold wrap-anywhere">{proposal.title}</p>
      <p className="text-sm text-ink-muted">
        The ticket deadline passed. Release the held shares back to each participant’s available
        balance.
      </p>
      <Steps
        labels={["Prepare", "Confirm in your wallet", "Update the trip"]}
        current={runner.current}
        error={runner.error}
      />
      <Button
        variant="secondary"
        disabled={runner.running}
        onClick={async () => {
          if (await run({ action: "refund", proposalId: proposal.id }))
            showToast("Held shares released");
        }}
      >
        {runner.running
          ? "Releasing…"
          : pending
            ? "Check previous attempt"
            : "Release expired hold"}
      </Button>
    </div>
  );
}

export function Settlement() {
  const { trip } = useTripActions();
  const money = useMoney(trip.id);
  const proposals = useProposals(trip.id);
  const { runner, run, pending } = useMoneyFlow(trip);
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const ended = Date.parse(trip.endsAt) <= Date.now();
  const holds = (proposals.data ?? []).filter(
    (proposal) => proposal.status === "locked" && Date.parse(proposal.deadline) <= Date.now(),
  );
  return (
    <section aria-labelledby="settlement-title" className="travel-settlement flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <TapeLabel>Journey’s end</TapeLabel>
        <FlagCheckered aria-hidden="true" size={28} className="shrink-0 text-ink" />
      </div>
      <h2 id="settlement-title" className="font-display text-xl font-semibold">
        Wrap up the trip
      </h2>
      <div className="flex flex-col gap-1 self-start rounded-control border border-dashed border-rule-strong px-4 py-3">
        <span className="text-sm text-ink-muted">
          {ended ? "Trip ended" : "Settlement unlocks"}
        </span>
        <time dateTime={trip.endsAt} className="font-semibold">
          {formatWhen(trip.endsAt)}
        </time>
      </div>
      <p>
        {money.data?.settled
          ? "The trip is settled. Each person can withdraw their own available balance."
          : "Settlement stops new purchases. It does not withdraw anyone’s money; each person chooses when to withdraw."}
      </p>
      {!money.data?.settled && (!ended || !money.isSuccess) && (
        <p id="settlement-reason" className="text-sm text-ink-muted">
          {!ended
            ? "The trip is still underway. You can settle after it ends."
            : money.isError
              ? "The balance could not be loaded. Refresh the balance before settling."
              : "Checking the trip balance before settlement becomes available."}
        </p>
      )}
      {!money.data?.settled && (
        <Button
          variant="secondary"
          disabled={!ended || !money.isSuccess}
          aria-describedby={!ended || !money.isSuccess ? "settlement-reason" : undefined}
          onClick={() => setOpen(true)}
        >
          Settle trip
        </Button>
      )}
      {proposals.isError && (
        <p role="alert">
          Expired holds could not be loaded.{" "}
          <button
            type="button"
            className="min-h-11 text-stamp-ink underline"
            onClick={() => void proposals.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {holds.map((proposal) => (
        <ReleaseHold key={proposal.id} proposal={proposal} />
      ))}
      <Sheet
        open={open}
        title="Settle trip"
        description="Stop new purchases for this trip. Available balances stay with their owners. Release any expired holds separately, then each person can withdraw their own money."
        onOpenChange={(next) => {
          if (!runner.running) {
            if (!next) runner.reset();
            setOpen(next);
          }
        }}
      >
        <div className="flex flex-col gap-5">
          <Steps
            labels={["Prepare", "Confirm in your wallet", "Update the trip"]}
            current={runner.current}
            error={runner.error}
          />
          <Button
            disabled={
              runner.running || (!pending && (!ended || !money.isSuccess || money.data.settled))
            }
            onClick={async () => {
              if (await run({ action: "settle" })) {
                runner.reset();
                setOpen(false);
                showToast("Trip settled");
              }
            }}
          >
            {runner.running
              ? "Settling…"
              : pending
                ? "Check previous attempt"
                : "Confirm settlement"}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
