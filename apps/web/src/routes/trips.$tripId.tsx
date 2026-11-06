import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "../auth/AuthGuard";
import { useSession } from "../auth/session";
import { AppShell } from "../components/shell/AppShell";
import { TripNames } from "../components/shell/TripNames";
import { Button } from "../components/ui/Button";
import { useTrip } from "../lib/trips";

export const Route = createFileRoute("/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = Route.useParams();
  const auth = useSession();
  const trip = useTrip(tripId);
  return (
    <AuthGuard>
      <AppShell
        tripId={tripId}
        {...(trip.data
          ? { tripName: trip.data.name, tripEnsName: trip.data.ensName, members: trip.data.members }
          : {})}
      >
        {trip.error && (
          <p role="alert" className="mb-4 text-declined">
            {trip.error.message}
          </p>
        )}
        {trip.data && <TripNames trip={trip.data} />}
        <Outlet />
        <div className="mt-8">
          <Button variant="secondary" disabled={auth.pending} onClick={() => void auth.signOut()}>
            Sign out
          </Button>
          {auth.error && <p role="alert">{auth.error}</p>}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
