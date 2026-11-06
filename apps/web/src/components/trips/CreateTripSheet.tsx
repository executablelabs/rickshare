import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toWalletCall, useWallet } from "../../auth/wallet";
import { endOfDay, tomorrowInput } from "../../lib/format-date";
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
  const [endsOn, setEndsOn] = useState("");
  const [touched, setTouched] = useState(false);

  const earliest = tomorrowInput();
  const nameError = touched && !name.trim() ? "Give the trip a name." : undefined;
  const dateError =
    touched && (!endsOn || endsOn < earliest) ? "Pick a day after today." : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!name.trim() || !endsOn || endsOn < earliest) return;
    const created = await runner.run(async (next) => {
      const prepared = await tripsApi.prepareCreate({
        name: name.trim(),
        endsAt: endOfDay(endsOn),
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
          placeholder="India 26"
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={nameError}
          disabled={runner.running}
          autoComplete="off"
        />
        <DatePicker
          min={earliest}
          value={endsOn}
          onChange={setEndsOn}
          error={dateError}
          disabled={runner.running}
        />
        <FundingAddress />
        <Steps labels={STEPS} current={runner.current} error={runner.error} />
        <Button type="submit" fullWidth disabled={runner.running}>
          {runner.running ? "Creating…" : runner.error ? "Try again" : "Create trip"}
        </Button>
      </form>
    </Sheet>
  );
}
