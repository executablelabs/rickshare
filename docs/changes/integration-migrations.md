# Integration: preserve pre-merge Track B databases

## Summary

The original Track B chat migration was renamed from 0000 to 0004 while the
parallel Track A history was merged. Its new timestamp made an existing Track B
database attempt to create chat tables a second time, preventing startup.
Make those table/index creations idempotent and close the SQLite handle if a
migration fails. No existing conversations, ticket URLs or sessions are deleted.

## Files

- apps/api/drizzle/0004_chat_and_itinerary.sql
- apps/api/src/db/client.ts
- apps/api/src/db/migration-compatibility.test.ts

## Interfaces touched

Database startup/migration compatibility only. Table schemas and payloads retain
their existing shape; the merged migration order remains intact.

## Verification

A regression fixture reproduces the original migration timestamp and stored
chat/ticket data. It failed with table-already-exists before the SQL fix. After
the fix, both original Track B and existing Track A databases upgrade, retain
their data and reopen successfully. Test databases are temporary ignored
workspace artifacts and are cleaned after the fixtures release SQLite handles.

## Follow-ups

Continue the agent-to-proposal integration with the merged B5 implementation.
