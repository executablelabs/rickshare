import { createFileRoute } from "@tanstack/react-router";
import { MoneyHistory } from "../components/money/MoneyHistory";
import { Settlement } from "../components/money/Settlement";
import { MoneyPanel } from "../components/trips/MoneyPanel";

export const Route = createFileRoute("/trips/$tripId/money")({
  component: Money,
});

function Money() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-rule pb-6">
        <h1 className="font-display text-3xl font-semibold">Money</h1>
        <p className="text-ink-muted">
          One shared adventure. Your balance, your limits, your call.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <MoneyPanel />
        <div className="flex flex-col gap-6">
          <Settlement />
          <MoneyHistory />
        </div>
      </div>
    </div>
  );
}
