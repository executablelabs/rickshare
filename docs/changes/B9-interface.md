# B9 interface: durable ENS metadata

## Summary

Reserve stable trip and member names separately from successful onchain registration.
Project only confirmed names through the existing Trip and Member fields, including
metadata refreshes and later chain snapshots. Financial state still comes from Arc.

## Files

- apps/api/src/db/schema.ts and drizzle/0007_ens_names.sql: additive ENS tables
- apps/api/src/db/ens-migration.test.ts: uniqueness and pending-state coverage
- apps/api/src/modules/indexer/service.ts and indexer.test.ts: confirmed name projection

## Interfaces touched

Add ens_trips and ens_members. Populate existing nullable ensName fields; no route,
shared schema, contract or environment changes.

## Verification

- bun run check: pass
- Regression coverage: pending names remain null; confirmed names survive refresh,
  chain updates and reconstruction without changing balances.

## Follow-ups

B9 part 2 provisions names, publishes the public itinerary and displays names.
