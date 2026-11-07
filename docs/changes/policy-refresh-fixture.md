# Policy refresh fixture

## Summary

The limits onboarding test now publishes the selected member's confirmed $40 automatic approval limit and $200 total cap after the mock wallet transaction succeeds. Both Trip and Money reads are rebuilt because `tripRoutes` snapshots Money members; leaving the original fixture in place prevented the policy-specific refresh check from ever completing. Existing validation, success, and request-body assertions are preserved, with an additional assertion for exactly one wallet transaction to the prepared vault.

## Files

- apps/web/src/components/trips/TripOnboarding.test.tsx: publish confirmed policy through both mocked reads.
- docs/changes/policy-refresh-fixture.md: change record.

## Interfaces touched

None.

## Verification

- `bunx --no-install biome check apps/web/src/components/trips/TripOnboarding.test.tsx`: passed.
- `bunx --no-install tsc --noEmit --incremental false -p apps/web/tsconfig.json`: passed.
- `git diff --check`: passed.
- Local test suites were not run, as requested.

## Follow-ups

CI verification of the existing onboarding test.
