import { createFileRoute } from "@tanstack/react-router";
import { MoneyHistory } from "../components/money/MoneyHistory";
import { MoneyPanel } from "../components/trips/MoneyPanel";

export const Route = createFileRoute("/trips/$tripId/money")({
  component: Money,
});

function Money() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold">Money</h1>
      <MoneyPanel />
      <MoneyHistory />
    </div>
  );
}
