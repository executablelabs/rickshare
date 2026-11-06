import {
  Plus,
  SealCheck,
  ShieldCheck,
  SlidersHorizontal,
  WarningCircle,
} from "@phosphor-icons/react";
import { useWallet } from "../../auth/wallet";
import { formatUsd } from "../../lib/format-usd";
import { messageOf } from "../../lib/http";
import { useMoney } from "../../lib/trips";
import { Loader } from "../brand/Loader";
import { TravelStamp } from "../brand/Travel";
import { Amount } from "../ui/Amount";
import { Avatar, displayNameOf } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useTripActions } from "./TripActions";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`travel-wallet__stat ${label === "Held" ? "travel-wallet__stat--held" : ""}`}>
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
      <div role="alert" className="travel-notice">
        <span className="travel-notice__icon">
          <WarningCircle size={24} aria-hidden="true" />
        </span>
        <h2>Balance unavailable</h2>
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
      <section aria-labelledby="my-money-title" className="travel-wallet">
        <div className="travel-wallet__heading">
          <div>
            <h2 id="my-money-title">Your balance</h2>
            <Amount
              value={BigInt(money.data.own.available)}
              display
              className="travel-wallet__amount"
            />
            {money.data && (
              <p className="text-sm text-ink-muted">
                In your wallet: {formatUsd(BigInt(money.data.walletBalance))}
              </p>
            )}
          </div>
          <TravelStamp vehicle="rickshaw">Your share</TravelStamp>
        </div>
        <div className="travel-wallet__totals">
          <Stat label="Added" value={money.data.own.deposited} />
          <Stat label="Held" value={money.data.own.locked} />
          <Stat label="Spent" value={money.data.own.spent} />
          <Stat label="Withdrawn" value={money.data.own.withdrawn} />
        </div>
        <div className="travel-wallet__actions">
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
        <div className="travel-wallet__policy">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            {cap === 0n
              ? "No automatic approvals. You'll be asked about every share."
              : `Approves up to ${formatUsd(autoMax)} per purchase for you, until your spending reaches ${formatUsd(cap)}.`}{" "}
            Balances are in USDC.
          </p>
        </div>
      </section>

      <section aria-labelledby="group-title" className="travel-crew">
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
                <Avatar
                  name={displayNameOf(member.displayName)}
                  colorKey={member.address}
                  size="sm"
                />
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
