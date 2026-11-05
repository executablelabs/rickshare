# B5 (interface): chat and itinerary tables

## Summary

Add the first SQLite tables: `chat_messages` and `itinerary_items`. They hold
derived state only (chat history and the itinerary), mirroring the shared
`ChatMessage` and `ItineraryItem` schemas. Split out of B5 because
`db/schema.ts` is an interface path; the agent work follows in its own PR.

## Files

- apps/api/src/db/schema.ts: `chatMessages` and `itineraryItems`, each with a
  per-trip ordering index.
- apps/api/drizzle/: generated migration `0000_chat_and_itinerary.sql` and
  drizzle-kit metadata.
- apps/api/src/db/client.ts: `createDatabase` applies migrations on open; adds the
  `AppDatabase` type.
- apps/api/src/db/client.test.ts: new.
- biome.json: ignore `apps/api/drizzle/meta` (generated).

## Interfaces touched

- New tables `chat_messages` and `itinerary_items`. Additive; nothing renamed or
  removed.
- `createDatabase` now runs migrations; `AppDatabase` type exported.

## Verification

- bun run check: pass (api: 5 tests, including migration and round trip on an
  in-memory database).
- bunx drizzle-kit generate: produces the committed migration from the schema.

## Follow-ups

- B5 agent module writes chat messages and itinerary items.
- B6 reads chat history; B8 reads the itinerary.
