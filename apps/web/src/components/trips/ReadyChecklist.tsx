import {
  CheckCircle,
  type Icon,
  SealCheck,
  SlidersHorizontal,
  UserPlus,
  Wallet,
} from "@phosphor-icons/react";
import { useWallet } from "../../auth/wallet";
import { cx } from "../../lib/cx";
import { memberOf } from "../../lib/trips";
import { Button } from "../ui/Button";
import { useTripActions } from "./TripActions";

interface Step {
  key: string;
  icon: Icon;
  title: string;
  text: string;
  done: boolean;
  action: string;
  onAction: () => void;
  busy?: boolean;
}

/** "Get the trip ready": the onboarding steps, in order, until every one is done. */
export function ReadyChecklist() {
  const { trip, isOrganizer, open, linkWorld, linkingWorld } = useTripActions();
  const wallet = useWallet();
  const me = memberOf(trip, wallet.address);
  if (!me) return null;

  const steps: Step[] = [
    ...(isOrganizer
      ? [
          {
            key: "invite",
            icon: UserPlus,
            title: "Invite friends",
            text: "Send each friend their own link.",
            done: trip.members.length > 1,
            action: "Invite",
            onAction: () => open("invite"),
          },
        ]
      : []),
    {
      key: "world",
      icon: SealCheck,
      title: "Verify with World",
      text: "Proves it's really you when you approve a share above your limits.",
      done: me.worldLinked,
      action: linkingWorld ? "Verifying…" : "Verify",
      onAction: linkWorld,
      busy: linkingWorld,
    },
    {
      key: "money",
      icon: Wallet,
      title: "Add money",
      text: "It stays yours until you approve something.",
      done: BigInt(me.deposited) > 0n,
      action: "Add",
      onAction: () => open("addMoney"),
    },
    {
      key: "limits",
      icon: SlidersHorizontal,
      title: "Set my limits",
      text: "Small shares can go through without asking you each time.",
      done: BigInt(me.policy.totalCap) > 0n,
      action: "Set",
      onAction: () => open("limits"),
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  return (
    <section
      aria-labelledby="ready-title"
      className="flex flex-col gap-4 rounded-ticket bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="ready-title" className="text-xl">
          Get the trip ready
        </h2>
        <span className="text-sm text-ink-muted">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Trip setup"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="h-1.5 overflow-hidden rounded-pill bg-paper"
      >
        <div
          className="h-full rounded-pill bg-coral motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ol className="flex flex-col divide-y divide-rule">
        {steps.map(({ key, icon: StepIcon, title, text, done, action, onAction, busy }) => (
          <li key={key} className="flex items-center gap-3 py-3">
            <span
              className={cx(
                "flex size-10 shrink-0 items-center justify-center rounded-pill",
                done ? "bg-stamp-tint text-stamp-ink" : "bg-paper text-ink",
              )}
            >
              {done ? (
                <CheckCircle aria-hidden="true" size={20} weight="fill" />
              ) : (
                <StepIcon aria-hidden="true" size={20} />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={cx("font-semibold", done && "text-ink-muted line-through")}>
                {title}
              </span>
              {!done && <span className="text-sm text-ink-muted">{text}</span>}
              {done && <span className="sr-only">Done</span>}
            </div>
            {!done && (
              <Button variant="secondary" className="h-11 px-4" disabled={busy} onClick={onAction}>
                {action}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
