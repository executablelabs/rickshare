import { PrivyProvider, useActiveWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { arcTestnet } from "@rickshare/shared";
import { type ReactNode, useRef } from "react";
import { createWalletClient, custom, getAddress, publicActions } from "viem";
import { config } from "../config";
import { createTransactionSender } from "./transactions";
import { WalletContext } from "./wallet";

const chain = config.VITE_ARC_RPC_URL
  ? { ...arcTestnet, rpcUrls: { default: { http: [config.VITE_ARC_RPC_URL] } } }
  : arcTestnet;

export default function PrivyWallet({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: { walletChainType: "ethereum-only" },
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
  const sender = useRef<ReturnType<typeof createTransactionSender> | undefined>(undefined);
  sender.current ??= createTransactionSender();
  const send = sender.current;
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();
  // Keep the selected, linked external account when a user also has an embedded wallet.
  const selectedAddress =
    activeWallet?.type === "ethereum" && activeWallet.linked
      ? activeWallet.address
      : user?.wallet?.address;
  const wallet = authenticated
    ? wallets.find(
        (candidate) =>
          candidate.linked && candidate.address.toLowerCase() === selectedAddress?.toLowerCase(),
      )
    : undefined;
  const address = wallet ? getAddress(wallet.address) : undefined;

  /** A client for the selected account on Arc, refusing to sign if the wallet moved underneath. */
  async function verifiedClient() {
    if (!wallet || !address) throw new Error("Your account is not ready. Try again.");
    await wallet.switchChain(chain.id);
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({
      account: address,
      chain,
      transport: custom(provider),
    }).extend(publicActions);
    const [account] = await client.getAddresses();
    if (
      account?.toLowerCase() !== address.toLowerCase() ||
      (await client.getChainId()) !== chain.id
    )
      throw new Error("Your account changed. Continue to sign in again.");
    return client;
  }
  return (
    <WalletContext.Provider
      value={{
        configured: true,
        ready: ready && walletsReady,
        authenticated,
        address,
        login,
        logout,
        signMessage: async (message) => (await verifiedClient()).signMessage({ message }),
        signTypedData: async (typedData) => (await verifiedClient()).signTypedData(typedData),
        sendTransaction: async (transaction) => {
          const client = await verifiedClient();
          if (!address) throw new Error("Your account is not ready. Try again.");
          return send(address, transaction, {
            broadcast: () =>
              client.sendTransaction({
                to: transaction.to,
                data: transaction.data,
                value: 0n,
                ...(transaction.maxFeePerGas
                  ? {
                      maxFeePerGas: BigInt(transaction.maxFeePerGas),
                      maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas ?? "0x0"),
                    }
                  : {}),
              }),
            receipt: (hash) => client.waitForTransactionReceipt({ hash }),
          });
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
