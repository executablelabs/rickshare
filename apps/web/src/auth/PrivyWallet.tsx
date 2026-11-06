import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { arcTestnet } from "@rickshare/shared";
import type { ReactNode } from "react";
import { createWalletClient, custom, getAddress } from "viem";
import { config } from "../config";
import { WalletContext } from "./wallet";

const chain = config.VITE_ARC_RPC_URL
  ? { ...arcTestnet, rpcUrls: { default: { http: [config.VITE_ARC_RPC_URL] } } }
  : arcTestnet;

export default function PrivyWallet({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        defaultChain: chain,
        supportedChains: [chain],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <WalletBridge>{children}</WalletBridge>
    </PrivyProvider>
  );
}

function WalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const wallet = authenticated
    ? wallets.find(
        (candidate) => candidate.address.toLowerCase() === user?.wallet?.address.toLowerCase(),
      )
    : undefined;
  const address = wallet ? getAddress(wallet.address) : undefined;
  return (
    <WalletContext.Provider
      value={{
        configured: true,
        ready: ready && walletsReady,
        authenticated,
        address,
        login,
        logout,
        signMessage: async (message) => {
          if (!wallet || !address) throw new Error("Your account is not ready. Try again.");
          await wallet.switchChain(chain.id);
          const provider = await wallet.getEthereumProvider();
          const client = createWalletClient({
            account: address,
            chain,
            transport: custom(provider),
          });
          const [account] = await client.getAddresses();
          if (
            account?.toLowerCase() !== address.toLowerCase() ||
            (await client.getChainId()) !== chain.id
          )
            throw new Error("Your account changed. Continue to sign in again.");
          return client.signMessage({ message });
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
