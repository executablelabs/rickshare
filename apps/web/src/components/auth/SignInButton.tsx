import { useSession } from "../../auth/session";
import { useWallet } from "../../auth/wallet";
import { Button, type ButtonProps } from "../ui/Button";

/**
 * Starts sign-in from anywhere: the first press opens the login options, the second asks the
 * account to sign Rickshare's sign-in message, which creates the API session.
 */
export function SignInButton({
  label = "Get started",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & { label?: string }) {
  const wallet = useWallet();
  const auth = useSession();
  const preparing = wallet.authenticated && !wallet.address;
  return (
    <Button
      {...props}
      disabled={!wallet.configured || auth.checking || auth.pending || preparing}
      onClick={() => (wallet.authenticated ? void auth.signIn() : wallet.login())}
    >
      {auth.pending
        ? "Signing in…"
        : preparing
          ? "Preparing your account…"
          : wallet.authenticated
            ? "Continue"
            : label}
    </Button>
  );
}
