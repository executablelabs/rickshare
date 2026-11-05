import { createFileRoute, redirect } from "@tanstack/react-router";

// Plan is the trip's home tab; the bare trip URL would otherwise render an empty shell.
export const Route = createFileRoute("/trips/$tripId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/trips/$tripId/plan", params, replace: true });
  },
});
