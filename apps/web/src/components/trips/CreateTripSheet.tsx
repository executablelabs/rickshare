import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toWalletCall, useWallet } from "../../auth/wallet";
import { endOfDay, startOfDay, todayInput } from "../../lib/format-date";
import { suggestTripLocation } from "../../lib/trip-location";
import { tripKeys, tripsApi } from "../../lib/trips";
import { Button } from "../ui/Button";
import { DatePicker } from "../ui/DatePicker";
import { Field } from "../ui/Field";
import { Sheet } from "../ui/Sheet";
import { Steps, useStepRunner } from "../ui/Steps";
import { useToast } from "../ui/Toast";
import { FundingAddress } from "./FundingAddress";

const STEPS = ["Prepare the trip and cover the fee", "Confirm in your wallet", "Set up the trip"];

export function CreateTripSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const showToast = useToast();
  const runner = useStepRunner();
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [locationOverride, setLocationOverride] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const earliest = todayInput();
  const suggestedLocation = suggestTripLocation(name);
  const location = locationOverride ?? suggestedLocation ?? "";
  const nameError = touched && !name.trim() ? "Give the trip a name." : undefined;
  const startError =
    touched && (!startsOn || startsOn < earliest)
      ? "Choose a start date from today onwards."
      : undefined;
  const endError =
    touched && (!endsOn || endsOn < earliest || (startsOn && endsOn < startsOn))
      ? "Choose an end date on or after the start date."
      : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (
      !name.trim() ||
      !startsOn ||
      startsOn < earliest ||
      !endsOn ||
      endsOn < startsOn ||
      endsOn < earliest
    )
      return;
    const created = await runner.run(async (next) => {
      const prepared = await tripsApi.prepareCreate({
        name: name.trim(),
        startsAt: startOfDay(startsOn),
        endsAt: endOfDay(endsOn),
        location: location.trim(),
      });
      next();
      const hash = await wallet.sendTransaction(toWalletCall(prepared.transaction));
      next();
      const { tripId } = await tripsApi.confirmCreate(prepared.creationId, hash);
      await queryClient.invalidateQueries({ queryKey: tripKeys.list });
      await navigate({ to: "/trips/$tripId/plan", params: { tripId } });
    });
    if (created) {
      onOpenChange(false);
      showToast("Trip created");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (runner.running) return;
        if (!next) {
          runner.reset();
          setTouched(false);
        }
        onOpenChange(next);
      }}
      title="New trip"
      description="Rickshare covers the setup fee. You'll be the organizer and can invite friends once it's set up."
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field
          label="Trip name"
          placeholder="NY 27"
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={nameError}
          disabled={runner.running}
          autoComplete="off"
        />
        <div className="flex flex-col gap-1">
          <Field
            label="Location"
            placeholder="City, region or country"
            value={location}
            onChange={(event) => setLocationOverride(event.target.value)}
            maxLength={160}
            disabled={runner.running}
            autoComplete="off"
            hint={
              locationOverride === null && suggestedLocation
                ? "Suggested from your trip name. You can change it."
                : "Where are you heading? Optional, and always editable before creation."
            }
          />
          {locationOverride !== null && suggestedLocation && location !== suggestedLocation && (
            <button
              type="button"
              className="min-h-11 self-start text-sm font-semibold text-stamp-ink underline underline-offset-4"
              disabled={runner.running}
              onClick={() => setLocationOverride(null)}
            >
              Use {suggestedLocation}
            </button>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <DatePicker
            label="Start date"
            calendarLabel="Choose trip start date"
            hint="The first day of your adventure."
            min={earliest}
            value={startsOn}
            onChange={setStartsOn}
            error={startError}
            disabled={runner.running}
          />
          <DatePicker
            label="End date"
            hint="After this day, settle the trip and withdraw any leftovers."
            min={startsOn || earliest}
            value={endsOn}
            onChange={setEndsOn}
            error={endError}
            disabled={runner.running}
          />
        </div>
        <FundingAddress />
        <Steps labels={STEPS} current={runner.current} error={runner.error} />
        <Button type="submit" fullWidth disabled={runner.running}>
          {runner.running ? "Creating…" : runner.error ? "Try again" : "Create trip"}
        </Button>
      </form>
    </Sheet>
  );
}
