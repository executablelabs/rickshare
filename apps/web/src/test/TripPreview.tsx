import type { Trip } from "@rickshare/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useWallet, WalletContext } from "../auth/wallet";
import { AppShell } from "../components/shell/AppShell";
import { MoneyPanel } from "../components/trips/MoneyPanel";
import { ReadyChecklist } from "../components/trips/ReadyChecklist";
import { TripActionsProvider } from "../components/trips/TripActions";
import { tripKeys } from "../lib/trips";

// Preview samples only, like the /dev/ui gallery: the real trip screen with fixed data and no
// network, so its layout can be reviewed without signing in.
const me: Address = "0x00000000000000000000000000000000000000a1";
const sampleTrip: Trip = {
  id: "preview",
  name: "India 26",
  ensName: "india-26-3fa2.rickshare.eth",
  vaultAddress: `0x${"a".repeat(40)}`,
  endsAt: "2026-12-18T23:59:00.000Z",
  members: [
    ["Angie", me, true, "120000000"],
    ["Bashy", `0x${"b".repeat(40)}`, true, "80000000"],
    ["Gitau", `0x${"c".repeat(40)}`, false, "0"],
  ].map(([displayName, address, worldLinked, deposited]) => ({
    address: address as string,
    displayName: displayName as string,
    ensName: null,
    worldLinked: worldLinked as boolean,
    policy: { autoApproveMax: "0", totalCap: "0" },
    deposited: deposited as string,
    spent: "0",
    locked: "0",
    available: deposited as string,
  })),
};

export default function TripPreview() {
  const wallet = useWallet();
  const [client] = useState(() => {
    const preview = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
    });
    preview.setQueryData(tripKeys.money(sampleTrip.id), {
      own: {
        deposited: "120000000",
        spent: "0",
        locked: "0",
        available: "120000000",
        withdrawn: "0",
      },
      walletBalance: "75000000",
      settled: false,
    });
    preview.setQueryData(tripKeys.invites(sampleTrip.id), []);
    return preview;
  });
  return (
    <div inert>
      <WalletContext.Provider value={{ ...wallet, authenticated: true, address: me }}>
        <QueryClientProvider client={client}>
          <TripActionsProvider trip={sampleTrip}>
            <AppShell
              tripId={sampleTrip.id}
              tripName={sampleTrip.name}
              subtitle="Ends 18 Dec"
              members={sampleTrip.members}
              aside={<MoneyPanel />}
              onSignOut={() => undefined}
            >
              <div className="flex flex-col gap-5">
                <h1 className="sr-only">Plan</h1>
                <ReadyChecklist />
              </div>
            </AppShell>
          </TripActionsProvider>
        </QueryClientProvider>
      </WalletContext.Provider>
    </div>
  );
}
