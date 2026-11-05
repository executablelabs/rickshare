import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/plan")({
  component: () => <h1>Plan</h1>,
});
