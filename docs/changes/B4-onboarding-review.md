# B4 review: complete safe onboarding integration

## Summary

Retain ENS names in the trip shell, resume deposit batches after their last confirmed
step, and construct invitation signatures locally with the canonical contract domain.
Keep sample trip data in a development-only, inert test preview.

## Files

- Trip shell and query integration with current main
- MoneySheets and InviteSheet: retry progress and exact signing context
- TripOnboarding tests: resumed deposits and invalid invitation contexts
- test/TripPreview and dev.trip route: development-only sample data

## Interfaces touched

None. Consume existing prepared transactions and canonical shared invite builders.

## Verification

- bun run check and web production build: pass
- Regressions cover retries and wrong vault/member/chain/signature type.
- Existing ENS and account isolation tests are retained.

## Follow-ups

Live World verification still needs a human sign-in with the configured provider.
