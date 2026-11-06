import type { ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { useSession } from "./session";
import { useWallet } from "./wallet";

export function AuthGuard({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const auth = useSession();
  if (auth.session) return children;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5 py-5">
      <h1>Rickshare</h1>
      <p>Plan together. Approve your own share.</p>
      {!wallet.configured ? (
        <p role="status" className="text-ink-muted">
          Sign-in is being set up. Please contact the trip organizer.
        </p>
      ) : auth.checking ? (
        <p role="status">Checking your sign-in…</p>
      ) : (
        <>
          <p className="text-ink-muted">Continue with your email. No extension needed.</p>
          <Button
            disabled={auth.pending || (wallet.authenticated && !wallet.address)}
            onClick={() => (wallet.authenticated ? void auth.signIn() : wallet.login())}
          >
            {auth.pending
              ? "Signing in…"
              : wallet.authenticated && !wallet.address
                ? "Preparing your account…"
                : "Continue"}
          </Button>
          {wallet.authenticated && (
            <Button variant="secondary" disabled={auth.pending} onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          )}
        </>
      )}
      {auth.error && <p role="alert">{auth.error}</p>}
    </main>
  );
}
