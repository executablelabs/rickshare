import { expect, test } from "bun:test";
import { createDatabase } from "../../db/client";
import { itineraryItems } from "../../db/schema";
import { createItineraryStore } from "./itinerary";

const ferry = {
  id: null,
  startsAt: "2026-12-14T10:00:00.000Z",
  title: "Elephanta Caves ferry and guided walk",
  location: "Mumbai",
  proposalId: "1",
};

test("replaces the itinerary in start order and keeps ticket links of kept items", () => {
  const db = createDatabase(":memory:");
  const itinerary = createItineraryStore(db);
  const [saved] = itinerary.replace("india26", [ferry]);
  if (!saved) throw new Error("expected the ferry to be saved");
  db.update(itineraryItems)
    .set({ ticketUrls: ["https://tickets.example/abc"] })
    .run();

  const paragliding = {
    id: null,
    startsAt: "2026-12-13T09:00:00.000Z",
    title: "Tandem paragliding in Arambol",
    location: "Goa",
    proposalId: null,
  };
  const result = itinerary.replace("india26", [{ ...ferry, id: saved.id }, paragliding]);

  expect(result.map((item) => item.title)).toEqual([paragliding.title, ferry.title]);
  expect(result[1]).toMatchObject({ id: saved.id, ticketUrls: ["https://tickets.example/abc"] });
  expect(result[0]?.ticketUrls).toEqual([]);
});

test("never moves another trip's item into this trip", () => {
  const db = createDatabase(":memory:");
  const itinerary = createItineraryStore(db);
  const [otherItem] = itinerary.replace("other-trip", [ferry]);
  if (!otherItem) throw new Error("expected the other trip's item to be saved");

  const [copied] = itinerary.replace("india26", [{ ...ferry, id: otherItem.id }]);

  expect(copied?.id).not.toBe(otherItem.id);
  expect(itinerary.list("other-trip")).toEqual([otherItem]);
});

test("never drops or duplicates an item that has tickets", () => {
  const db = createDatabase(":memory:");
  const itinerary = createItineraryStore(db);
  const [ticketed] = itinerary.replace("india26", [ferry]);
  if (!ticketed) throw new Error("expected the ferry to be saved");
  db.update(itineraryItems)
    .set({ ticketUrls: ["https://tickets.example/abc"] })
    .run();

  const withoutIt = itinerary.replace("india26", [{ ...ferry, title: "Dinner" }]);
  expect(withoutIt.map((item) => item.id)).toContain(ticketed.id);

  const twice = itinerary.replace("india26", [
    { ...ferry, id: ticketed.id },
    { ...ferry, id: ticketed.id, title: "Copy" },
  ]);
  const withTickets = twice.filter((item) => item.ticketUrls.length > 0);
  expect(withTickets.map((item) => item.id)).toEqual([ticketed.id]);
  expect(twice).toHaveLength(2);
});

test("an empty replace clears the trip", () => {
  const itinerary = createItineraryStore(createDatabase(":memory:"));
  itinerary.replace("india26", [ferry]);
  expect(itinerary.replace("india26", [])).toEqual([]);
});
