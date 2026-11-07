# B3: non-blocking indexed trip reads

## Summary

Return an existing member's indexed trip immediately instead of awaiting live blockchain reads and a full indexer cycle on every poll. Refresh through the shared indexer in the background and log refresh failures without failing the indexed response. Keep the existing chain-check-and-sync recovery path when the trip or actor's membership is not yet indexed.

## Files

- `apps/api/src/modules/trips/service.ts`: indexed fast path in `TripService.get`.

## Interfaces touched

None. Authentication, response schema and the unknown/non-member recovery path are preserved.

## Verification

- Production diagnosis before the change: authenticated trip requests took roughly 13–21 seconds, with client cancellations around 15 seconds. Six live membership/info RPC calls took about 3 seconds in isolation, before waiting for indexer work.
- `bun run lint`: pass.
- `bun --filter @rickshare/api typecheck`: pass.
- No tests added or run locally, per the owner's temporary instruction; this overrides the normal per-commit full-check and new-test requirements for this follow-up.

## Risk and rollback

Displayed balances can lag the chain until background indexing catches up. Access still requires the authenticated actor to be in the configured factory's indexed trip; current vault membership is append-only. Money-moving actions retain their existing fresh on-chain validation, approval checks and spending limits. Revert this commit to restore synchronous reads.

## Follow-ups

After merge/deployment, confirm the affected trip returns quickly for its signed-in member and continues receiving indexed updates. Unindexed trips and newly joined members still use the slower recovery path.
