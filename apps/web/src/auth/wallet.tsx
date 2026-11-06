import type { WalletTransaction } from "@rickshare/shared";
import { createContext, lazy, type ReactNode, Suspense, useContext } from "react";
import { type Address, getAddress, type Hex, isHex, type TypedDataDefinition } from "viem";
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

/** Narrows an API-prepared transaction to what the wallet sends, checking its hex fields. */
export function toWalletCall(transaction: WalletTransaction): WalletCall {
  const { data, maxFeePerGas, maxPriorityFeePerGas } = transaction;
  if (!isHex(data) || !isHex(maxFeePerGas) || !isHex(maxPriorityFeePerGas))
    throw new Error("The prepared transaction is malformed. Try again.");
  return { to: getAddress(transaction.to), data, maxFeePerGas, maxPriorityFeePerGas };
}

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

const loading: Wallet = {
  configured: true,
  ready: false,
  authenticated: false,
  address: undefined,
  login: () => undefined,
  logout: async () => undefined,
  signMessage: unavailable,
  signTypedData: unavailable,
  sendTransaction: unavailable,
};
const PrivyWallet = lazy(() => import("./PrivyWallet"));

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!config.VITE_PRIVY_APP_ID) return children;
  return (
    <Suspense
      fallback={
        // While the sign-in code loads, pages render with a wallet that is not ready yet, so the
        // landing page appears at once and only sign-in actions wait.
        <WalletContext.Provider value={loading}>{children}</WalletContext.Provider>
      }
    >
      <PrivyWallet appId={config.VITE_PRIVY_APP_ID}>{children}</PrivyWallet>
    </Suspense>
  );
}
