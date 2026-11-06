# B4 review: preserve ENS and recover pending wallet receipts

## Summary

Integrate onboarding with the merged ENS display and authenticated trip queries.
Keep a known transaction hash when receipt lookup fails so retrying checks that
transaction instead of broadcasting again. Bind prepared calls to their expected
member, and coalesce simultaneous attempts for the same call.

## Files

- apps/web/src/lib/trips.ts: retain confirmed names, cancellation and session guards
- apps/web/src/auth/transactions.ts: pending receipt recovery and sender binding
- apps/web/src/auth/PrivyWallet.tsx and wallet.tsx: wallet integration
- Regression tests and isolated route API fixtures

## Interfaces touched

WalletCall gains an optional expected sender. Existing trip API and ENS display remain.

## Verification

- bun run check: pass
- Web production build: pass
- Regression coverage: receipt failures, simultaneous retry, wrong sender and reverts

## Follow-ups

Pending wallet hashes are retained for the current provider lifetime. Browser-reload
recovery and outcomes where a provider never returns a hash need a durable intent protocol.
