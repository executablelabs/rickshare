import { ItineraryItem } from "@rickshare/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./api";
import { readApi } from "./http";

export function useItinerary(tripId: string) {
  return useQuery({
    queryKey: ["trips", tripId, "itinerary"],
    retry: false,
    queryFn: async () =>
      (
        await readApi(
          await api.trips[":tripId"].itinerary.$get({ param: { tripId } }),
          z.object({ items: z.array(ItineraryItem) }),
        )
      ).items,
  });
}
