import type { ItineraryItem } from "@kitty/shared";
import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { itineraryItems } from "../../db/schema";

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

export function createItineraryStore(db: AppDatabase) {
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
     * Replaces a trip's itinerary. Ticket links of kept items survive, since they come from
     * merchants, not from the drafts. Ids that do not belong to this trip become new items.
     */
    replace(tripId: string, drafts: ItineraryDraft[]): ItineraryItem[] {
      db.transaction((tx) => {
        const existing = new Map(
          tx
            .select()
            .from(itineraryItems)
            .where(eq(itineraryItems.tripId, tripId))
            .all()
            .map((row) => [row.id, row]),
        );
        tx.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId)).run();

        const keptIds = new Set<string>();
        const rows = drafts.map((draft) => {
          const previous = draft.id ? existing.get(draft.id) : undefined;
          const id = previous && !keptIds.has(previous.id) ? previous.id : Bun.randomUUIDv7();
          keptIds.add(id);
          return {
            id,
            tripId,
            startsAt: draft.startsAt,
            title: draft.title,
            location: draft.location,
            proposalId: draft.proposalId,
            ticketUrls: previous?.ticketUrls ?? [],
          };
        });
        if (rows.length > 0) tx.insert(itineraryItems).values(rows).run();
      });
      return list(tripId);
    },
  };
}

export type ItineraryStore = ReturnType<typeof createItineraryStore>;
