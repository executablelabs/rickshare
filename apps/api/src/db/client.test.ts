import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { createDatabase } from "./client";
import { chatMessages, itineraryItems } from "./schema";

test("a new database is migrated and stores chat messages in order", () => {
  const db = createDatabase(":memory:");
  const createdAt = "2026-12-14T10:00:00.000Z";
  db.insert(chatMessages)
    .values([
      {
        id: "0193c6f0-0000-7000-8000-000000000002",
        tripId: "india26",
        role: "agent",
        author: null,
        text: "Here is a ferry option.",
        proposalIds: ["1"],
        createdAt,
      },
      {
        id: "0193c6f0-0000-7000-8000-000000000001",
        tripId: "india26",
        role: "member",
        author: "0x0000000000000000000000000000000000000001",
        text: "Ideas for Mumbai?",
        proposalIds: [],
        createdAt,
      },
    ])
    .run();

  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.tripId, "india26"))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .all();
  expect(rows.map((row) => row.text)).toEqual(["Ideas for Mumbai?", "Here is a ferry option."]);
  expect(rows[1]?.proposalIds).toEqual(["1"]);
});

test("itinerary items keep their ticket urls", () => {
  const db = createDatabase(":memory:");
  db.insert(itineraryItems)
    .values({
      id: "item-1",
      tripId: "india26",
      startsAt: "2026-12-14T10:00:00.000Z",
      title: "Elephanta Caves ferry and guided walk",
      location: "Mumbai",
      proposalId: null,
      ticketUrls: ["https://tickets.example/abc"],
    })
    .run();
  expect(db.select().from(itineraryItems).get()?.ticketUrls).toEqual([
    "https://tickets.example/abc",
  ]);
});
