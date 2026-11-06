import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { AuthGuard } from "../auth/AuthGuard";
import { useSession } from "../auth/session";
import { Loader } from "../components/brand/Loader";
import { TravelArt, TravelError, TravelStamp } from "../components/brand/Travel";
import { AppShell } from "../components/shell/AppShell";
import { TripNames } from "../components/shell/TripNames";
import { TripActionsProvider } from "../components/trips/TripActions";
import { formatTripDates } from "../lib/format-date";
import { formatUsd } from "../lib/format-usd";
import { memberOf, useTrip } from "../lib/trips";

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
  const match = useMatchRoute();
  const onItineraryTab = !!match({ to: "/trips/$tripId/itinerary", params: { tripId } });
  const signOut = () => void auth.signOut();

  if (!trip.data)
    return (
      <AppShell tripId={tripId} onSignOut={signOut}>
        {trip.isError ? (
          <TravelError error={trip.error} onRetry={() => void trip.refetch()} />
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
        tripEnsName={trip.data.ensName}
        subtitle={formatTripDates(trip.data.startsAt, trip.data.endsAt)}
        tripLocation={trip.data.location}
        members={trip.data.members}
        balance={(() => {
          const own = memberOf(trip.data, auth.session?.address);
          return own ? (
            <p className="travel-shell__balance">
              Your balance <strong>{formatUsd(BigInt(own.available))}</strong>
              <span>
                {BigInt(own.policy.totalCap) > 0n
                  ? `Auto-approves up to ${formatUsd(BigInt(own.policy.autoApproveMax))}`
                  : "Every share asks you first"}
              </span>
            </p>
          ) : null;
        })()}
        aside={
          !onItineraryTab ? undefined : (
            <div className="travel-companion">
              <TravelArt vehicle="bus" photo />
              <TravelStamp vehicle="plane">Make room for good days</TravelStamp>
              <p>
                Your plans can be shared.
                <br />
                Your approval is always yours.
              </p>
            </div>
          )
        }
        onSignOut={signOut}
      >
        <TripNames trip={trip.data} ownAddress={auth.session?.address} />
        <Outlet />
      </AppShell>
    </TripActionsProvider>
  );
}
