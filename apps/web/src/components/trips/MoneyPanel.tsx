import { Plus, SealCheck, SlidersHorizontal } from "@phosphor-icons/react";
import { useWallet } from "../../auth/wallet";
import { formatUsd } from "../../lib/format-usd";
import { memberOf, useMoney } from "../../lib/trips";
import { Amount } from "../ui/Amount";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useTripActions } from "./TripActions";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
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
  const me = memberOf(trip, wallet.address);
  const autoMax = me ? BigInt(me.policy.autoApproveMax) : 0n;
  const cap = me ? BigInt(me.policy.totalCap) : 0n;

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="my-money-title"
        className="flex flex-col gap-5 rounded-ticket bg-card p-5 shadow-card"
      >
        <div className="flex flex-col gap-1">
          <h2 id="my-money-title" className="text-sm font-semibold text-ink-muted">
            Your balance
          </h2>
          <Amount value={BigInt(me?.available ?? "0")} display className="text-3xl" />
          {money.data && (
            <p className="text-sm text-ink-muted">
              In your wallet: {formatUsd(BigInt(money.data.walletBalance))}
            </p>
          )}
        </div>
        {me && (
          <div className="grid grid-cols-3 gap-3 border-t border-rule pt-4">
            <Stat label="Added" value={me.deposited} />
            <Stat label="Held" value={me.locked} />
            <Stat label="Spent" value={me.spent} />
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <Button fullWidth onClick={() => open("addMoney")}>
            <Plus aria-hidden="true" size={20} />
            Add money
          </Button>
          <Button variant="secondary" fullWidth onClick={() => open("limits")}>
            <SlidersHorizontal aria-hidden="true" size={20} />
            My limits
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
        className="flex flex-col gap-1 rounded-ticket bg-card p-5 shadow-card"
      >
        <h2 id="group-title" className="text-sm font-semibold text-ink-muted">
          The group
        </h2>
        <ul className="divide-y divide-rule">
          {trip.members.map((member) => (
            <li key={member.address} className="flex items-center gap-3 py-3">
              <Avatar name={member.displayName} colorKey={member.address} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-semibold">
                  {member.displayName}
                  {member.address.toLowerCase() === wallet.address?.toLowerCase() && (
                    <span className="font-normal text-ink-muted">(you)</span>
                  )}
                  {member.worldLinked && (
                    <SealCheck aria-label="Verified with World" size={16} className="text-stamp" />
                  )}
                </span>
                {member.ensName && (
                  <span className="truncate text-xs text-ink-muted">{member.ensName}</span>
                )}
              </div>
              <Amount value={BigInt(member.available)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
