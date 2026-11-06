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

const Invite = z.object({
  inviteId: z.string(),
  status: z.enum(["open", "claimed", "authorized", "joined", "expired"]),
  member: z.string().nullable(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof Invite>;

const JoinState = z.object({
  inviteId: z.string(),
  tripId: z.string(),
  status: z.enum(["open", "claimed", "authorized", "joined", "expired"]),
  transaction: WalletTransaction.nullable(),
});
export type JoinState = z.infer<typeof JoinState>;

export function useInvites(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: tripKeys.invites(tripId),
    enabled,
    // Only the creator may list invites; a 403 is the answer "not the organizer", not a failure.
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
    // A friend may claim the link at any moment, and the organizer has to let them in.
    refetchInterval: (query) =>
      query.meta?.offlinePreview === true || query.state.status === "error" ? false : 5000,
    queryFn: async () =>
      (
        await readApi(
          await api.trips[":tripId"].invites.$get({ param: { tripId } }),
          z.object({ invites: z.array(Invite) }),
        )
      ).invites,
  });
}

export const inviteApi = {
  async create(tripId: string) {
    return readApi(
      await api.trips[":tripId"].invites.$post({ param: { tripId }, json: {} }),
      z.object({ inviteId: z.string(), url: z.string().url(), expiresAt: z.string() }),
    );
  },
  async authorization(tripId: string, inviteId: string) {
    return readApi(
      await api.trips[":tripId"].invites[":inviteId"].authorization.$get({
        param: { tripId, inviteId },
      }),
      z.object({ typedData: z.unknown(), authorized: z.boolean() }),
    );
  },
  async authorize(tripId: string, inviteId: string, signature: Hex) {
    return readApi(
      await api.trips[":tripId"].invites[":inviteId"].authorization.$post({
        param: { tripId, inviteId },
        json: { signature },
      }),
      z.object({ authorized: z.boolean() }),
    );
  },
  async claim(token: string) {
    return readApi(await api.invites[":token"].claim.$post({ param: { token } }), JoinState);
  },
  async state(inviteId: string) {
    return readApi(await api.invites[":inviteId"].$get({ param: { inviteId } }), JoinState);
  },
  async confirm(inviteId: string, transactionHash: Hex) {
    return readApi(
      await api.invites[":inviteId"].confirm.$post({
        param: { inviteId },
        json: { transactionHash },
      }),
      z.object({ tripId: z.string(), joined: z.boolean() }),
    );
  },
  async profile(tripId: string, displayName: string) {
    return readApi(
      await api.trips[":tripId"].members.me.$post({ param: { tripId }, json: { displayName } }),
      z.unknown(),
    );
  },
};

export type MoneyAction =
  | { action: "deposit"; amount: string }
  | { action: "withdraw"; amount: string }
  | { action: "policy"; autoApproveMax: string; totalCap: string }
  | { action: "reject"; proposalId: string }
  | { action: "refund"; proposalId: string }
  | { action: "settle" };

/** Asks the API for the member's own unsigned transactions; the wallet sends them in order. */
export async function prepareMoneyAction(tripId: string, action: MoneyAction) {
  return (
    await readApi(
      await api.trips[":tripId"].actions.$post({ param: { tripId }, json: action }),
      z.object({ action: z.string(), transactions: z.array(WalletTransaction) }),
    )
  ).transactions;
}
