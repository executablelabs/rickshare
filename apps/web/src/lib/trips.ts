import { Trip, UsdcAmount, WalletTransaction } from "@rickshare/shared";
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { useSession } from "../auth/session";
import { api } from "./api";
import { ApiError, readApi } from "./http";

// The query client is already scoped per signed-in account (providers.tsx), so keys only need
// to name the data, not the account.
export const tripKeys = {
  list: ["trips"] as const,
  one: (tripId: string) => ["trips", tripId] as const,
  money: (tripId: string) => ["trips", tripId, "money"] as const,
  invites: (tripId: string) => ["trips", tripId, "invites"] as const,
};

const TripList = z.object({ trips: z.array(Trip) });

export const Money = z.object({
  own: z.object({
    deposited: UsdcAmount,
    spent: UsdcAmount,
    locked: UsdcAmount,
    available: UsdcAmount,
    withdrawn: UsdcAmount,
  }),
  walletBalance: UsdcAmount,
  settled: z.boolean(),
});
export type Money = z.infer<typeof Money>;

export function useTrips() {
  return useQuery({
    queryKey: tripKeys.list,
    queryFn: async () => (await readApi(await api.trips.$get(), TripList)).trips,
  });
}

export const tripApi = {
  async get(tripId: string, signal?: AbortSignal) {
    try {
      return await readApi(
        await api.trips[":tripId"].$get({ param: { tripId } }, signal ? { init: { signal } } : {}),
        Trip,
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof z.ZodError)
        throw new ApiError(
          "INVALID_RESPONSE",
          "We could not read the trip. Refresh and try again.",
          502,
        );
      throw new ApiError("API_UNAVAILABLE", "We could not reach Rickshare. Try again.", 503);
    }
  },
};

export function useTrip(tripId: string) {
  const { session } = useSession();
  return useQuery({
    queryKey: tripKeys.one(tripId),
    queryFn: ({ signal }) => tripApi.get(tripId, signal),
    enabled: !!session,
    retry: false,
    refetchInterval: 5000,
  });
}

export function useMoney(tripId: string) {
  return useQuery({
    queryKey: tripKeys.money(tripId),
    queryFn: async () =>
      readApi(await api.trips[":tripId"].money.$get({ param: { tripId } }), Money),
  });
}

/** The member's own row in a trip, matched case-insensitively. */
export function memberOf(trip: Trip | undefined, address: Address | undefined) {
  if (!trip || !address) return undefined;
  return trip.members.find((member) => member.address.toLowerCase() === address.toLowerCase());
}

export const tripsApi = {
  async prepareCreate(input: { name: string; endsAt: string }) {
    return readApi(
      await api.trips.$post({ json: input }),
      z.object({ creationId: z.string(), transaction: WalletTransaction }),
    );
  },
  async confirmCreate(creationId: string, transactionHash: Hex) {
    return readApi(
      await api.trips.confirm.$post({ json: { creationId, transactionHash } }),
      z.object({ tripId: z.string() }),
    );
  },
};
