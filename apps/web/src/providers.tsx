import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect, useMemo } from "react";
import { SessionProvider } from "./auth/session";
import { useWallet, WalletProvider } from "./auth/wallet";
import { ToastProvider } from "./components/ui/Toast";
import type { createAppRouter } from "./router";

export function AppProviders({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return (
    <WalletProvider>
      <IdentityScope>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </IdentityScope>
    </WalletProvider>
  );
}

function IdentityScope({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const identity = wallet.authenticated ? wallet.address?.toLowerCase() : undefined;
  const queryClient = useMemo(() => {
    // Each account owns a separate cache, including private ticket URLs and stream cursors.
    return new QueryClient({ defaultOptions: { queries: { meta: { identity } } } });
  }, [identity]);
  useEffect(
    () => () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Fragment key={identity ?? "signed-out"}>{children}</Fragment>
      </SessionProvider>
    </QueryClientProvider>
  );
}
