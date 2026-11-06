import type { Trip } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toWalletCall, useWallet } from "../../auth/wallet";
import { formatUsd } from "../../lib/format-usd";
import { memberOf, prepareMoneyAction, tripKeys, useMoney } from "../../lib/trips";
import { parseUsd, toUsdInput } from "../../lib/usd-input";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Sheet } from "../ui/Sheet";
import { Steps, useStepRunner } from "../ui/Steps";
import { useToast } from "../ui/Toast";

const STEPS = ["Prepare", "Confirm in your wallet", "Update the trip"];
const QUICK_AMOUNTS = ["25", "50", "100"];

type SheetProps = { trip: Trip; open: boolean; onOpenChange: (open: boolean) => void };

/** Sends the prepared transactions one by one, then refreshes everything money touches. */
function useMoneyFlow(trip: Trip) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const runner = useStepRunner();
  async function run(action: Parameters<typeof prepareMoneyAction>[1]) {
    return runner.run(async (next) => {
      const transactions = await prepareMoneyAction(trip.id, action);
      next();
      for (const transaction of transactions)
        await wallet.sendTransaction(toWalletCall(transaction));
      next();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.one(trip.id) }),
        queryClient.invalidateQueries({ queryKey: tripKeys.money(trip.id) }),
        queryClient.invalidateQueries({ queryKey: tripKeys.list }),
      ]);
    });
  }
  return { runner, run };
}

function closeUnlessRunning(
  runner: ReturnType<typeof useStepRunner>,
  onOpenChange: (open: boolean) => void,
  reset: () => void,
) {
  return (next: boolean) => {
    if (runner.running) return;
    if (!next) {
      runner.reset();
      reset();
    }
    onOpenChange(next);
  };
}

export function AddMoneySheet({ trip, open, onOpenChange }: SheetProps) {
  const money = useMoney(trip.id);
  const showToast = useToast();
  const { runner, run } = useMoneyFlow(trip);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const value = parseUsd(amount);
  const wallet = money.data ? BigInt(money.data.walletBalance) : undefined;
  const error = !touched
    ? undefined
    : value === null || value === 0n
      ? "Enter an amount above $0.00."
      : wallet !== undefined && value > wallet
        ? `Your wallet has ${formatUsd(wallet)}. Add less, or top up your wallet first.`
        : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (value === null || value === 0n || (wallet !== undefined && value > wallet)) return;
    if (await run({ action: "deposit", amount: value.toString() })) {
      onOpenChange(false);
      showToast(`${formatUsd(value)} added`);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={closeUnlessRunning(runner, onOpenChange, () => {
        setAmount("");
        setTouched(false);
      })}
      title="Add money"
      description="It stays yours. It only pays for things you approve, and leftovers come back."
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field
          label="Amount in USDC"
          inputMode="decimal"
          placeholder="50.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={error}
          hint={wallet !== undefined ? `In your wallet: ${formatUsd(wallet)}` : undefined}
          disabled={runner.running}
          autoComplete="off"
        />
        <div className="flex gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <button
              key={quick}
              type="button"
              disabled={runner.running}
              onClick={() => setAmount(quick)}
              className="h-11 flex-1 rounded-control bg-paper font-semibold text-ink hover:bg-rule disabled:opacity-50"
            >
              ${quick}
            </button>
          ))}
        </div>
        <Steps labels={STEPS} current={runner.current} error={runner.error} />
        <Button type="submit" fullWidth disabled={runner.running}>
          {runner.running ? "Adding…" : runner.error ? "Try again" : "Add money"}
        </Button>
      </form>
    </Sheet>
  );
}

export function LimitsSheet({ trip, open, onOpenChange }: SheetProps) {
  const wallet = useWallet();
  const showToast = useToast();
  const { runner, run } = useMoneyFlow(trip);
  const me = memberOf(trip, wallet.address);
  const initial = {
    auto: me ? toUsdInput(BigInt(me.policy.autoApproveMax)) : "",
    cap: me ? toUsdInput(BigInt(me.policy.totalCap)) : "",
  };
  const [auto, setAuto] = useState(initial.auto);
  const [cap, setCap] = useState(initial.cap);
  const [touched, setTouched] = useState(false);
  const autoValue = parseUsd(auto);
  const capValue = parseUsd(cap);
  const autoError =
    touched && autoValue === null ? "Enter an amount, or 0 to always ask." : undefined;
  const capError =
    touched && capValue === null
      ? "Enter an amount, or 0 to always ask."
      : touched && autoValue !== null && capValue !== null && autoValue > capValue
        ? "The total cap can't be lower than a single automatic approval."
        : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (autoValue === null || capValue === null || autoValue > capValue) return;
    const saved = await run({
      action: "policy",
      autoApproveMax: autoValue.toString(),
      totalCap: capValue.toString(),
    });
    if (saved) {
      onOpenChange(false);
      showToast("Limits saved");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={closeUnlessRunning(runner, onOpenChange, () => {
        setAuto(initial.auto);
        setCap(initial.cap);
        setTouched(false);
      })}
      title="My limits"
      description="Shares under these limits are approved for you automatically. Anything above asks you first."
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field
          label="Approve automatically up to"
          inputMode="decimal"
          placeholder="0.00"
          value={auto}
          onChange={(event) => setAuto(event.target.value)}
          hint="Per purchase. Use 0 to always be asked."
          error={autoError}
          disabled={runner.running}
        />
        <Field
          label="Total cap"
          inputMode="decimal"
          placeholder="0.00"
          value={cap}
          onChange={(event) => setCap(event.target.value)}
          hint="Automatic approvals stop once your spending on this trip reaches this."
          error={capError}
          disabled={runner.running}
        />
        <Steps labels={STEPS} current={runner.current} error={runner.error} />
        <Button type="submit" fullWidth disabled={runner.running}>
          {runner.running ? "Saving…" : runner.error ? "Try again" : "Save limits"}
        </Button>
      </form>
    </Sheet>
  );
}
