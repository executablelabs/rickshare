import { createFileRoute } from "@tanstack/react-router";
import { MoneyPanel } from "../components/trips/MoneyPanel";

export const Route = createFileRoute("/trips/$tripId/money")({
  component: Money,
});

function Money() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl">Money</h1>
      <MoneyPanel />
    </div>
  );
}
