# B4 (part 1): landing, trip list and new trip

## Summary

Signed out, `/` is now a landing page: a hero with the pitch and three promises, an example ticket on desktop, a how-it-works timeline and a closing call to action. Signed in, `/` lists the member's trips as cards with their own balance, or an empty state. New trip creates the vault from the member's own wallet, showing each step. The wallet can now send transactions and sign typed data, which the rest of B4 and B7 build on.

## Files

- apps/web/src/auth/wallet.tsx, PrivyWallet.tsx: `sendTransaction` (waits for a successful receipt), `signTypedData`, `toWalletCall`; pages render while sign-in loads
- apps/web/src/auth/AuthGuard.tsx: centered sign-in card
- apps/web/src/components/landing/Landing.tsx, brand/Wordmark.tsx, auth/SignInButton.tsx: landing page
- apps/web/src/components/plan/ProposalTicket.tsx: the ticket with status, stamps and perforation
- apps/web/src/components/trips/{Home,TripCard,CreateTripSheet}.tsx, ui/Steps.tsx: trip list and creation
- apps/web/src/lib/{http,trips,format-date}.ts: API errors, trip queries, dates
- apps/web/src/styles/tokens.css: 48px landing headline; buttons no longer wrap
- tests: wallet sends and reverts, landing, trip list, create trip (success, cancelled wallet, validation), ticket statuses, API errors; `src/test/api.ts` stubs fetch for the typed client

## Interfaces touched

None in code. The design rules are in the B4 interface PR.

## Verification

- bun run check: pass (web 104)
- Headless Chrome: landing at 390 and 1280; gallery tickets and trip card at 1280. No horizontal overflow.

## Follow-ups

B4 part 2 (invites and join, World link, add money, my limits, money panel, checklist), then B7.
