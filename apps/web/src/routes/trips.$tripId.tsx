import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { AuthGuard } from "../auth/AuthGuard";
import { useSession } from "../auth/session";
import { Loader } from "../components/brand/Loader";
import { AppShell } from "../components/shell/AppShell";
import { MoneyPanel } from "../components/trips/MoneyPanel";
import { TripActionsProvider } from "../components/trips/TripActions";
import { Button } from "../components/ui/Button";
import { formatDay } from "../lib/format-date";
import { messageOf } from "../lib/http";
import { useTrip } from "../lib/trips";

export const Route = createFileRoute("/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  return (
    <AuthGuard title="Sign in to open this trip">
      <TripPage />
    </AuthGuard>
  );
}

function TripPage() {
  const { tripId } = Route.useParams();
  const auth = useSession();
  const trip = useTrip(tripId);
  // The Money tab already shows the money panel, so the side panel would repeat it.
  const onMoneyTab = !!useMatchRoute()({ to: "/trips/$tripId/money", params: { tripId } });
  const signOut = () => void auth.signOut();

  if (!trip.data)
    return (
      <AppShell tripId={tripId} onSignOut={signOut}>
        {trip.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-ticket bg-card p-5 shadow-card"
          >
            <p>{messageOf(trip.error)}</p>
            <Button variant="secondary" onClick={() => void trip.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <Loader label="Loading trip" />
        )}
      </AppShell>
    );

  return (
    <TripActionsProvider trip={trip.data}>
      <AppShell
        tripId={tripId}
        tripName={trip.data.name}
        subtitle={`Ends ${formatDay(trip.data.endsAt)}`}
        members={trip.data.members}
        aside={onMoneyTab ? undefined : <MoneyPanel />}
        onSignOut={signOut}
      >
        <Outlet />
      </AppShell>
    </TripActionsProvider>
  );
}
