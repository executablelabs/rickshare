# B8: balances, history and trip settlement

## Summary

Money now reads the backend's fixed-block balance snapshot for the member and group, including cumulative withdrawals. History uses numeric-order server cursors, removes duplicate events across pages and links to actual transactions. Members can withdraw only their available money, release expired purchase holds and settle an ended trip through prepared wallet transactions.

## Files

- apps/web/src/lib/trips.ts and lib/money.ts: snapshot validation, paged history and polling
- apps/web/src/components/trips/MoneyPanel.tsx: authoritative balances and own withdrawal action
- apps/web/src/components/money/{MoneyHistory,WithdrawSheet,Settlement}.tsx: history and member wallet flows
- apps/web/src/components/trips/{MoneySheets,TripActions}.tsx: reuse receipt recovery and share the stream across tabs
- apps/web/src/lib/plan.ts and plan.test.ts: invalidate financial history on stream updates
- apps/web/src/routes/trips.$tripId.money.tsx: complete Money page
- apps/web/src/components/money/Money.test.tsx and test fixtures: precision, receipts, refunds, settlement and errors

## Interfaces touched

None. Consumes existing money, history, proposal and member action endpoints. No environment variables or dependencies added.

## Verification

- bun run check: pass before every commit
- Web production build: pass
- Regression tests cover fixed-block balances, cursor pagination and deduplication, six-decimal withdrawal precision, own available-balance limits, pending receipt retries, settlement without automatic withdrawals, expired holds, mismatched prepared calls, malformed responses and error recovery.
- Headless Chrome: Money at 390px, 768px and 1280px; actions remain reachable after scrolling, with no horizontal overflow or runtime errors. Withdrawal sheet checked at phone and desktop widths.
- Browser/API/wallet tests use stubs. No live wallet transactions or paid API calls.

## Follow-ups

B10: live demo flow and accessibility pass. Settlement stops new purchases; expired holds must be released separately and members choose when to withdraw their own balances. Receipt recovery remains scoped to the current wallet provider session.
