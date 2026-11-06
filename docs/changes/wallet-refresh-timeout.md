# wallet-refresh-timeout: bound refresh after confirmation

## Summary

Stop the post-confirmation step from waiting indefinitely on trip refresh requests. One prefix invalidation starts fresh trip queries without overlapping cancellation, and a 15-second deadline restores an actionable state if the API is still busy. Limits remain locked to the retained request until the confirmed batch finishes refreshing.

## Files

- `apps/web/src/components/trips/MoneySheets.tsx`: deduplicate invalidation, bound its wait, retain the confirmed transaction batch on timeout, and preserve limits across closing and reopening.
- `docs/changes/wallet-refresh-{390,1280}.png`: screenshots of the confirmed transaction waiting for refresh.

## Interfaces touched

None. Signing, prepared transaction checks and receipt confirmation remain unchanged.

## Verification

- Controlled browser: stalled refresh reaches the 15-second deadline; closing and reopening retains the submitted limits; retry starts fresh queries without preparing or sending another wallet transaction; late canceled responses cannot replace the recovered data.
- Screenshots at 390px and 1280px captured with no horizontal overflow.
- `bun run check`: pass (lint, all typechecks, API 182, shared 18, merchants 6, contracts 98, web 186 tests).
- No test files added or edited, as requested by the owner.

## Follow-ups

None. An update timeout does not resend confirmed transactions; retry resumes the retained batch at the refresh step.
