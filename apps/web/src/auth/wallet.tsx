import { createContext, lazy, type ReactNode, Suspense, useContext } from "react";
import type { Address, Hex, TypedDataDefinition } from "viem";
import { config } from "../config";

export type Wallet = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  address: Address | undefined;
  login: () => void;
  logout: () => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
  /** Signs EIP-712 data, e.g. the organizer's invite authorization. */
  signTypedData: (typedData: TypedDataDefinition) => Promise<Hex>;
  /** Sends on Arc from the signed-in account and resolves once the receipt confirms success. */
  sendTransaction: (transaction: WalletCall) => Promise<Hex>;
};

/** What the app asks the wallet to send: always to a contract, never with native value. */
export type WalletCall = {
  to: Address;
  data: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
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
  signTypedData: unavailable,
  sendTransaction: unavailable,
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
