import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "../auth/AuthGuard";
import { useSession } from "../auth/session";
import { AppShell } from "../components/shell/AppShell";
import { Button } from "../components/ui/Button";

export const Route = createFileRoute("/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = Route.useParams();
  const auth = useSession();
  return (
    <AuthGuard>
      <AppShell tripId={tripId}>
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
