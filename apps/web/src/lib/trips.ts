import { Trip } from "@rickshare/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useSession } from "../auth/session";
import { api } from "./api";

class TripRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const tripApi = {
  async get(tripId: string, signal?: AbortSignal) {
    let response: Pick<Response, "ok" | "json">;
    try {
      response = await api.trips[":tripId"].$get(
        { param: { tripId } },
        signal ? { init: { signal } } : {},
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new TripRequestError("API_UNAVAILABLE", "We could not reach Rickshare. Try again.");
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(body);
      throw parsed.success
        ? new TripRequestError(parsed.data.error.code, parsed.data.error.message)
        : new TripRequestError("API_UNAVAILABLE", "This request did not finish. Try again.");
    }
    const parsed = Trip.safeParse(body);
    if (!parsed.success)
      throw new TripRequestError(
        "INVALID_RESPONSE",
        "We could not read the trip. Refresh and try again.",
      );
    return parsed.data;
  },
};

export function useTrip(tripId: string) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["trip", session?.address.toLowerCase(), tripId.toLowerCase()],
    queryFn: ({ signal }) => tripApi.get(tripId, signal),
    enabled: !!session,
    retry: false,
    refetchInterval: 5000,
  });
}
