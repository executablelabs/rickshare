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
import { JourneyTrack, TapeLabel } from "../brand/TravelDetails";
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
  if (doneCount === steps.length)
    return (
      <div className="travel-ready">
        <CheckCircle size={20} weight="fill" aria-hidden="true" /> Ready to go
      </div>
    );
  const current = steps.findIndex((step) => !step.done);
  return (
    <section aria-labelledby="ready-title" className="travel-readiness">
      <TapeLabel>Your departure checklist</TapeLabel>
      <div className="travel-readiness__heading">
        <h2 id="ready-title">Get the trip ready</h2>
        <span>
          {doneCount} of {steps.length} done
        </span>
      </div>
      <JourneyTrack
        vehicle="rickshaw"
        current={current}
        count={steps.length}
        className="travel-readiness__route"
      >
        {steps.map(({ key, icon: StepIcon, title, text, done, action, onAction, busy }, index) => (
          <div
            key={key}
            className={cx("travel-readiness__stop", done && "travel-readiness__stop--done")}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="travel-readiness__dot" aria-hidden="true">
              {done ? <CheckCircle size={24} weight="fill" /> : <StepIcon size={22} />}
            </span>
            <div>
              <span className="font-semibold">{title}</span>
              <p>{done ? "Done" : text}</p>
            </div>
            {!done && (
              <Button variant="secondary" className="h-11 px-3" disabled={busy} onClick={onAction}>
                {action}
              </Button>
            )}
          </div>
        ))}
      </JourneyTrack>
    </section>
  );
}
