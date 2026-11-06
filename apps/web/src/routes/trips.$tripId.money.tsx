import { createFileRoute } from "@tanstack/react-router";
import { TravelIntro } from "../components/brand/Travel";
import { MoneyHistory } from "../components/money/MoneyHistory";
import { Settlement } from "../components/money/Settlement";
import { MoneyPanel } from "../components/trips/MoneyPanel";

export const Route = createFileRoute("/trips/$tripId/money")({
  component: Money,
});

function Money() {
  return (
    <div className="flex flex-col gap-6">
      <TravelIntro
        title="Money"
        description="One group adventure. Your money. Your call."
        vehicle="plane"
      />
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
