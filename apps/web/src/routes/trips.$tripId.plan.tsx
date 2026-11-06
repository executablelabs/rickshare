import { createFileRoute } from "@tanstack/react-router";
import { ReadyChecklist } from "../components/trips/ReadyChecklist";

export const Route = createFileRoute("/trips/$tripId/plan")({
  component: Plan,
});

function Plan() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Plan</h1>
      <ReadyChecklist />
    </div>
  );
}
