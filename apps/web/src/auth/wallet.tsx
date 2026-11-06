import { createContext, lazy, type ReactNode, Suspense, useContext } from "react";
import type { Address, Hex } from "viem";
import { config } from "../config";

export type Wallet = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  address: Address | undefined;
  login: () => void;
  logout: () => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
};

const unavailable = () => {
  throw new Error("Sign-in is not configured. Please contact the trip organizer.");
};
export const WalletContext = createContext<Wallet>({
  configured: false,
  ready: true,
  authenticated: false,
  address: undefined,
  login: unavailable,
  logout: async () => unavailable(),
  signMessage: unavailable,
});
export const useWallet = () => useContext(WalletContext);
const PrivyWallet = lazy(() => import("./PrivyWallet"));

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!config.VITE_PRIVY_APP_ID) return children;
  return (
    <Suspense
      fallback={
        <p role="status" className="px-5 py-5">
          Preparing sign-in…
        </p>
      }
    >
      <PrivyWallet appId={config.VITE_PRIVY_APP_ID}>{children}</PrivyWallet>
    </Suspense>
  );
}
