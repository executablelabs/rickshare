import { TripEvent } from "@rickshare/shared";
import type { AppDatabase } from "../../db/client";
import { tripEvents } from "../../db/schema";
import type { TripEventEnvelope } from "./types";

export function saveTripEvent(
  transaction: Pick<AppDatabase, "insert">,
  tripId: string,
  input: TripEvent,
): TripEventEnvelope {
  const parsed = TripEvent.parse(input);
  const data =
    parsed.type === "itinerary.updated"
      ? { ...parsed, items: parsed.items.map((item) => ({ ...item, ticketUrls: [] })) }
      : parsed;
  const row = transaction
    .insert(tripEvents)
    .values({ tripId, payload: JSON.stringify(data) })
    .returning()
    .get();
  return { id: row.id.toString(), tripId, data };
}
