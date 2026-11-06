import type { ReactNode } from "react";
import { SignInButton } from "../components/auth/SignInButton";
import { Wordmark } from "../components/brand/Wordmark";
import { Button } from "../components/ui/Button";
import { useSession } from "./session";
import { useWallet } from "./wallet";

/** Shows its children only with a session; otherwise a sign-in card for that page. */
export function AuthGuard({
  children,
  title = "Sign in to continue",
  description = "Plan together. Approve your own share.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const wallet = useWallet();
  const auth = useSession();
  if (auth.session) return children;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-band bg-card p-6 shadow-card lg:p-8">
        <Wordmark />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl">{title}</h1>
          <p className="text-ink-muted">{description}</p>
        </div>
        {!wallet.configured ? (
          <p role="status" className="text-ink-muted">
            Sign-in is being set up. Please contact the trip organizer.
          </p>
        ) : auth.checking ? (
          <p role="status">Checking your sign-in…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <SignInButton label="Continue" fullWidth />
            <p className="text-center text-sm text-ink-muted">
              Google, email or the wallet you already use. No extension needed.
            </p>
            {wallet.authenticated && (
              <Button
                variant="secondary"
                fullWidth
                disabled={auth.pending}
                onClick={() => void auth.signOut()}
              >
                Sign out
              </Button>
            )}
          </div>
        )}
        {auth.error && (
          <p role="alert" className="text-sm text-declined">
            {auth.error}
          </p>
        )}
      </div>
    </main>
  );
}
