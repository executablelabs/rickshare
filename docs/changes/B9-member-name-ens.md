# B9: register friendly aliases after member name changes

## Summary

Saving a member's own display name now reserves a readable ENS alias for registration by the existing coordinator. Duplicate names receive a deterministic address suffix, while previous aliases remain reserved to their original member and continue resolving onchain. Only a matching completed registration publishes the new name; stale registrations cannot confirm a newer profile edit.

## Files

- apps/api/src/modules/ens/store.ts: reserve aliases, retain historical bindings and confirm the current label only
- apps/api/src/modules/trips/service.ts: reserve an alias atomically with the authenticated member's profile update

## Interfaces touched

None. No schema, route, ABI, roles or authentication changes.

## Verification

- Frozen dependency installation: pass
- bun run check: pass (lint, all typechecks, API 182, shared 18, merchants 6, contracts 98 and web 186 tests)
- Inline proof using the existing in-memory ENS chain and real profile service/indexer: normalized names, duplicate-name suffixes, Unicode fallback, repeated edits, returning to an earlier alias, stale confirmations, confirmed-only projection and membership guard pass
- Inline chain proof: previous aliases still resolve to their original member; new aliases keep the same address; agent permissions remain limited to the itinerary key
- Existing test files remain unchanged at the user's explicit request

## Follow-ups

None.
