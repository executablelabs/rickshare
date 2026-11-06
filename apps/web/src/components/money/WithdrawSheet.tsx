import { type Trip, USDC_DECIMALS } from "@rickshare/shared";
import { type FormEvent, useState } from "react";
import { formatUnits } from "viem";
import { formatUsd } from "../../lib/format-usd";
import { useMoney } from "../../lib/trips";
import { parseUsd } from "../../lib/usd-input";
import { useMoneyFlow } from "../trips/MoneySheets";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Sheet } from "../ui/Sheet";
import { Steps } from "../ui/Steps";
import { useToast } from "../ui/Toast";

export function WithdrawSheet({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const money = useMoney(trip.id);
  const { runner, run, pending } = useMoneyFlow(trip);
  const showToast = useToast();
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const value = parseUsd(amount);
  const available = BigInt(money.data?.own.available ?? "0");
  const error = !touched
    ? undefined
    : value === null || value === 0n
      ? "Enter an amount above $0.00."
      : !pending && value > available
        ? "Only your available balance can be withdrawn."
        : undefined;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (value === null || value === 0n || (!pending && (!money.isSuccess || value > available)))
      return;
    if (await run({ action: "withdraw", amount: value.toString() })) {
      runner.reset();
      onOpenChange(false);
      setAmount("");
      setTouched(false);
      showToast(`${formatUsd(value)} withdrawn`);
    }
  }
  return (
    <Sheet
      open={open}
      title="Withdraw money"
      description="Only your unlocked money returns to your own wallet. Held money stays in the trip until its purchase is resolved."
      onOpenChange={(next) => {
        if (runner.running) return;
        if (!next) {
          runner.reset();
          if (!pending) {
            setAmount("");
            setTouched(false);
          }
        }
        onOpenChange(next);
      }}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field
          label="Amount to withdraw in USDC"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={error}
          disabled={runner.running || pending}
          hint={`Available: ${formatUsd(available)}`}
        />
        <Button
          variant="secondary"
          disabled={runner.running || pending || !money.isSuccess}
          onClick={() => setAmount(formatUnits(available, USDC_DECIMALS))}
        >
          Use available balance
        </Button>
        <Steps
          labels={["Prepare", "Confirm in your wallet", "Update the trip"]}
          current={runner.current}
          error={runner.error}
        />
        <Button type="submit" disabled={runner.running || (!pending && !money.isSuccess)}>
          {runner.running ? "Withdrawing…" : pending ? "Check previous attempt" : "Withdraw money"}
        </Button>
      </form>
    </Sheet>
  );
}
