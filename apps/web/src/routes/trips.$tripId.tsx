import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";

export const Route = createFileRoute("/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = Route.useParams();
  return (
    <AppShell tripId={tripId}>
      <Outlet />
    </AppShell>
  );
}
