import { Plus, SealCheck, SlidersHorizontal } from "@phosphor-icons/react";
import { useWallet } from "../../auth/wallet";
import { formatUsd } from "../../lib/format-usd";
import { messageOf } from "../../lib/http";
import { useMoney } from "../../lib/trips";
import { Loader } from "../brand/Loader";
import { Amount } from "../ui/Amount";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useTripActions } from "./TripActions";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control bg-paper p-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <Amount value={BigInt(value)} />
    </div>
  );
}

/** Your balance and actions, then the group. The desktop right panel and the Money tab. */
export function MoneyPanel() {
  const { trip, open } = useTripActions();
  const wallet = useWallet();
  const money = useMoney(trip.id);
  const me = money.data?.members.find(
    (member) => member.address.toLowerCase() === wallet.address?.toLowerCase(),
  );
  const autoMax = me ? BigInt(me.policy.autoApproveMax) : 0n;
  const cap = me ? BigInt(me.policy.totalCap) : 0n;
  if (money.isError)
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-ticket bg-card p-5 shadow-card"
      >
        <p>{messageOf(money.error)}</p>
        <Button variant="secondary" onClick={() => void money.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!money.data) return <Loader label="Loading balances" />;
  const ended = money.data.settled || Date.parse(trip.endsAt) <= Date.now();

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="my-money-title"
        className="flex flex-col gap-5 overflow-hidden rounded-ticket border border-rule bg-card p-5 shadow-card"
      >
        <div className="-mx-5 -mt-5 flex flex-col gap-2 bg-ink px-5 py-6 text-card">
          <h2 id="my-money-title" className="text-sm font-semibold text-card/75">
            Your balance
          </h2>
          <Amount value={BigInt(money.data.own.available)} display className="text-3xl" />
          {money.data && (
            <p className="text-sm text-card/75">
              In your wallet: {formatUsd(BigInt(money.data.walletBalance))}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Added" value={money.data.own.deposited} />
          <Stat label="Held" value={money.data.own.locked} />
          <Stat label="Spent" value={money.data.own.spent} />
          <Stat label="Withdrawn" value={money.data.own.withdrawn} />
        </div>
        <div className="flex flex-col gap-2.5">
          <Button fullWidth disabled={ended} onClick={() => open("addMoney")}>
            <Plus aria-hidden="true" size={20} />
            Add money
          </Button>
          <Button variant="secondary" fullWidth disabled={ended} onClick={() => open("limits")}>
            <SlidersHorizontal aria-hidden="true" size={20} />
            My limits
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={BigInt(money.data.own.available) === 0n}
            onClick={() => open("withdraw")}
          >
            Withdraw money
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          {cap === 0n
            ? "No automatic approvals. You'll be asked about every share."
            : `Approves up to ${formatUsd(autoMax)} per purchase for you, until your spending reaches ${formatUsd(cap)}.`}{" "}
          Balances are in USDC.
        </p>
      </section>

      <section
        aria-labelledby="group-title"
        className="flex flex-col gap-2 rounded-ticket border border-rule bg-card p-5 shadow-card"
      >
        <h2 id="group-title" className="text-sm font-semibold text-ink-muted">
          The group
        </h2>
        <ul className="divide-y divide-rule">
          {money.data.members.map((balance) => {
            const member =
              trip.members.find(
                (member) => member.address.toLowerCase() === balance.address.toLowerCase(),
              ) ?? balance;
            return (
              <li key={member.address} className="flex items-center gap-3 py-3">
                <Avatar name={member.displayName} colorKey={member.address} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    {member.displayName}
                    {member.address.toLowerCase() === wallet.address?.toLowerCase() && (
                      <span className="font-normal text-ink-muted">(you)</span>
                    )}
                    {member.worldLinked && (
                      <SealCheck
                        aria-label="Verified with World"
                        size={16}
                        className="text-stamp"
                      />
                    )}
                  </span>
                  {member.ensName && (
                    <span className="truncate text-xs text-ink-muted">{member.ensName}</span>
                  )}
                </div>
                <Amount value={BigInt(balance.available)} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
