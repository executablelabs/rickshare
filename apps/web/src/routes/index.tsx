import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "../auth/session";
import { Landing } from "../components/landing/Landing";
import { Home } from "../components/trips/Home";

export const Route = createFileRoute("/")({
  component: Index,
});

/** Signed out, `/` is the landing page; signed in, it lists the member's trips. */
function Index() {
  const auth = useSession();
  return auth.session ? <Home /> : <Landing />;
}
