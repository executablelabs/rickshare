import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { authApi, type Session, signInMessage } from "../lib/auth";
import { ApiError } from "../lib/http";
import { useWallet } from "./wallet";

type Auth = {
  session: Session | null;
  checking: boolean;
  pending: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);

function clearPrivateQueries(client: QueryClient) {
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "auth",
  };
  void client.cancelQueries(filters);
  client.removeQueries(filters);
  client.getMutationCache().clear();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const client = useQueryClient();
  const address = wallet.address?.toLowerCase();
  const identity = useRef(address);
  identity.current = address;
  const operation = useRef<Promise<void> | null>(null);
  const signingOut = useRef(false);
  const revision = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOutAddress, setSignedOutAddress] = useState<string>();
  const signedOut = !!address && signedOutAddress === address;
  const key = ["auth", address];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => authApi.session(signal),
    enabled: wallet.ready && wallet.authenticated && !!address && !signedOut && !pending,
    retry: false,
    // Verification already returns the session; re-enabling must not immediately replace it.
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? 30_000 : false),
  });
  const session =
    !signedOut &&
    wallet.ready &&
    wallet.authenticated &&
    query.data &&
    query.data.address.toLowerCase() === address &&
    Date.parse(query.data.expiresAt) > Date.now()
      ? query.data
      : null;

  useEffect(() => {
    if (query.data === null) clearPrivateQueries(client);
  }, [client, query.data]);

  useEffect(() => {
    return client.getQueryCache().subscribe((event) => {
      if (
        pending ||
        event.type !== "updated" ||
        event.query.queryKey[0] === "auth" ||
        (event.action.type !== "failed" && event.action.type !== "error") ||
        !(event.action.error instanceof ApiError) ||
        event.action.error.status !== 401
      )
        return;
      revision.current++;
      void client.cancelQueries({ queryKey: ["auth", address] });
      client.setQueryData(["auth", address], null);
      clearPrivateQueries(client);
    });
  }, [client, address, pending]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      () => {
        void client.cancelQueries({ queryKey: ["auth", address] });
        client.setQueryData(["auth", address], null);
        clearPrivateQueries(client);
      },
      Math.min(Date.parse(session.expiresAt) - Date.now(), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [client, address, session]);

  async function signIn() {
    if (operation.current || signingOut.current) return;
    setPending(true);
    setError(null);
    const currentAddress = wallet.address;
    const currentRevision = ++revision.current;
    const assertCurrent = () => {
      if (
        !currentAddress ||
        identity.current !== currentAddress.toLowerCase() ||
        revision.current !== currentRevision
      )
        throw new Error("Your account changed. Continue to sign in again.");
    };
    const task = (async () => {
      try {
        if (!currentAddress) throw new Error("Your account is not ready.");
        assertCurrent();
        await client.cancelQueries({ queryKey: key });
        clearPrivateQueries(client);
        const nonce = await authApi.nonce();
        assertCurrent();
        const message = signInMessage(currentAddress, nonce, window.location.origin);
        const signature = await wallet.signMessage(message);
        assertCurrent();
        const result = await authApi.verify(message, signature);
        assertCurrent();
        if (result.address.toLowerCase() !== identity.current)
          throw new Error("Your sign-in did not match this account. Try again.");
        client.setQueryData(key, result);
        setSignedOutAddress(undefined);
      } catch {
        if (!signingOut.current) setError("Sign-in did not finish. Continue to try again.");
      } finally {
        if (!signingOut.current) setPending(false);
      }
    })();
    operation.current = task;
    await task;
    operation.current = null;
  }

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    revision.current++;
    setSignedOutAddress(address);
    setPending(true);
    setError(null);
    try {
      await client.cancelQueries();
      client.clear();
      // Let an in-flight verification finish before revoking its cookie.
      await operation.current;
      await authApi.logout();
      await wallet.logout();
    } catch {
      setError("Sign-out did not finish. Try signing out again.");
    } finally {
      signingOut.current = false;
      setSignedOutAddress(address);
      setPending(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        checking: !wallet.ready || (query.isPending && query.fetchStatus === "fetching"),
        pending,
        error:
          error ?? (query.isError ? "We could not check your sign-in. Continue to retry." : null),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSession() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("SessionProvider is required.");
  return auth;
}
