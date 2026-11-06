import type { ItineraryItem } from "@rickshare/shared";
import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { itineraryItems } from "../../db/schema";
import { logger } from "../../lib/logger";
import { saveTripEvent } from "../indexer/events";
import type { TripEventEnvelope } from "../indexer/types";

export interface ItineraryDraft {
  /** An existing item of this trip to keep, or null for a new one. */
  id: string | null;
  startsAt: string;
  title: string;
  location: string;
  proposalId: string | null;
}

type ItineraryRow = typeof itineraryItems.$inferSelect;

function toItineraryItem(row: ItineraryRow): ItineraryItem {
  return {
    id: row.id,
    startsAt: row.startsAt,
    title: row.title,
    location: row.location,
    proposalId: row.proposalId,
    ticketUrls: row.ticketUrls,
  };
}

export function createItineraryStore(
  db: AppDatabase,
  publish?: (event: TripEventEnvelope) => void,
) {
  function list(tripId: string): ItineraryItem[] {
    return db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(asc(itineraryItems.startsAt), asc(itineraryItems.id))
      .all()
      .map(toItineraryItem);
  }

  return {
    list,

    /**
     * Replaces a trip's itinerary with the drafts. Ticket links come from merchants, not from
     * drafts: a kept item keeps its tickets, and an item with tickets is never dropped, because
     * members paid for them. Ids that do not belong to this trip become new items.
     */
    replace(tripId: string, drafts: ItineraryDraft[]): ItineraryItem[] {
      const event = db.transaction((tx) => {
        const existing = new Map(
          tx
            .select()
            .from(itineraryItems)
            .where(eq(itineraryItems.tripId, tripId))
            .all()
            .map((row) => [row.id, row]),
        );
        tx.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId)).run();

        const rows: ItineraryRow[] = [];
        for (const draft of drafts) {
          const previous = draft.id ? existing.get(draft.id) : undefined;
          // Each existing item is kept at most once, so its tickets never show up twice.
          if (previous) existing.delete(previous.id);
          rows.push({
            id: previous?.id ?? Bun.randomUUIDv7(),
            tripId,
            startsAt: draft.startsAt,
            title: draft.title,
            location: draft.location,
            proposalId: draft.proposalId,
            ticketUrls: previous?.ticketUrls ?? [],
          });
        }
        for (const leftOut of existing.values()) {
          if (leftOut.ticketUrls.length > 0) rows.push(leftOut);
        }
        if (rows.length > 0) tx.insert(itineraryItems).values(rows).run();
        const saved = tx
          .select()
          .from(itineraryItems)
          .where(eq(itineraryItems.tripId, tripId))
          .orderBy(asc(itineraryItems.startsAt), asc(itineraryItems.id))
          .all()
          .map(toItineraryItem);
        return saveTripEvent(tx, tripId, { type: "itinerary.updated", items: saved });
      });
      try {
        publish?.(event);
      } catch {
        logger.error("ITINERARY_EVENT_PUBLISH_PENDING");
      }
      return list(tripId);
    },
  };
}

export type ItineraryStore = ReturnType<typeof createItineraryStore>;
