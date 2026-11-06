import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "../auth/AuthGuard";
import { useSession } from "../auth/session";
import { Button } from "../components/ui/Button";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const auth = useSession();
  return (
    <AuthGuard>
      <main className="px-5 py-5">
        <h1>Rickshare</h1>
        <p className="py-5">You’re signed in. Open your trip link to join the group.</p>
        <Button variant="secondary" disabled={auth.pending} onClick={() => void auth.signOut()}>
          Sign out
        </Button>
        {auth.error && <p role="alert">{auth.error}</p>}
      </main>
    </AuthGuard>
  );
}
