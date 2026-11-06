import type { Trip } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { messageOf } from "../../lib/http";
import { useTripStream } from "../../lib/plan";
import { tripKeys, useInvites } from "../../lib/trips";
import { verifyWithWorld, worldApi } from "../../lib/world";
import { useToast } from "../ui/Toast";
import { InviteSheet } from "./InviteSheet";
import { AddMoneySheet, LimitsSheet } from "./MoneySheets";

type SheetName = "addMoney" | "limits" | "invite";

interface TripActions {
  trip: Trip;
  /** True once the API confirmed this member created the trip. */
  isOrganizer: boolean;
  open: (sheet: SheetName) => void;
  linkWorld: () => void;
  linkingWorld: boolean;
}

const TripActionsContext = createContext<TripActions | null>(null);

export function useTripActions() {
  const actions = useContext(TripActionsContext);
  if (!actions) throw new Error("TripActionsProvider is required.");
  return actions;
}

/** Owns the trip's sheets so the Plan checklist, the money panel and the header can open them. */
export function TripActionsProvider({
  trip,
  children,
  stream = true,
}: {
  trip: Trip;
  children: ReactNode;
  stream?: boolean;
}) {
  useTripStream(trip.id, stream);
  const queryClient = useQueryClient();
  const showToast = useToast();
  const invites = useInvites(trip.id, true);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [linkingWorld, setLinkingWorld] = useState(false);

  function linkWorld() {
    setLinkingWorld(true);
    verifyWithWorld(() => worldApi.startLink())
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: tripKeys.one(trip.id) });
        showToast("World verified");
      })
      .catch((error: unknown) => showToast(messageOf(error), { tone: "error" }))
      .finally(() => setLinkingWorld(false));
  }

  const close = (open: boolean) => {
    if (!open) setSheet(null);
  };

  return (
    <TripActionsContext.Provider
      value={{ trip, isOrganizer: invites.isSuccess, open: setSheet, linkWorld, linkingWorld }}
    >
      {children}
      <AddMoneySheet trip={trip} open={sheet === "addMoney"} onOpenChange={close} />
      <LimitsSheet
        key={sheet === "limits" ? "open" : "closed"}
        trip={trip}
        open={sheet === "limits"}
        onOpenChange={close}
      />
      {invites.isSuccess && (
        <InviteSheet trip={trip} open={sheet === "invite"} onOpenChange={close} />
      )}
    </TripActionsContext.Provider>
  );
}
