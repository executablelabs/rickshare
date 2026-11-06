import { createFileRoute } from "@tanstack/react-router";
import { Itinerary } from "../components/itinerary/Itinerary";

export const Route = createFileRoute("/trips/$tripId/itinerary")({
  component: Itinerary,
});
