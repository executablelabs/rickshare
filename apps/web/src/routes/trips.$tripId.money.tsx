import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/money")({
  component: () => <h1>Money</h1>,
});
