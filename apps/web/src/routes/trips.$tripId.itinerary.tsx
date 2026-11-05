import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/itinerary")({
  component: () => <h1>Itinerary</h1>,
});
