# B7: select planner activities and book together

## Summary
The planner links catalog-backed suggestions to a shared selection list showing each activity, merchant and per-person amount. Members can select multiple activities, choose participants and dates, review fresh signed quotes, and create independent purchase requests through the existing approval and ticket flow. Six clearly labelled testnet demo activities extend the existing merchant catalog to New York, Cannes and Nairobi, Kenya without adding wallets.

## Files
- apps/api/src/modules/agent/prompt.ts: catalog references and ideas-only shortlist instructions
- apps/merchants/src/catalog.json: six demo activities under existing merchants
- apps/web/src/lib/activity-suggestions.ts: validated catalog-reference parsing
- apps/web/src/lib/activities.ts: catalog queries, signed-quote validation and existing purchase API calls
- apps/web/src/components/plan/ActivitySelection.tsx: multi-select, participants, dates, price review and same-quote recovery
- apps/web/src/components/plan/Feed.tsx: shared purchase requests and readable suggestion labels
- apps/web/src/components/itinerary/Itinerary.tsx: pending and locked selections alongside booked tickets
- apps/web/src/routes/trips.$tripId.plan.tsx: selection panel in Plan
- docs/changes/B7-activity-selection/: browser screenshots

## Interfaces touched
None. Existing chat text carries relative catalog references; the existing catalog, quote, proposal, stream and ticket routes remain unchanged. No contracts, shared schemas, databases, authentication or wallet configuration changed.

## Verification
- Baseline bun run check: pass, 490 existing tests; VITEST_MAX_WORKERS=1 avoids local worker contention.
- Final bun run check: pass, 490 existing tests (API 182, web 186, contracts 98, shared 18, merchants 6), with VITEST_MAX_WORKERS=2. Production web build: pass.
- Browser at 390px and 1280px: two suggested cards with merchants/prices, multi-select, two participants, explicit dates/times, $7 per person/$14 group review, zero submissions before Book, exactly two purchase requests, shared feed controls, pending/booked itinerary and no overflow. Completed checkout persists across tab remount without resending. Screenshots use the real components and hooks with an explicitly labelled local wallet/API preview and signed quote fixtures.
- Browser failure/recovery: an uncertain second submission stops the batch and survives tab remount without resending or requoting. Explicit recovery resends the identical signed quote and shares, resulting in exactly two proposals overall. A second signed-in member sees both shared requests with their own approval/decline controls and itinerary entries, while checkbox drafts remain private.
- Real local Anvil flow: signed-in member selects two New York activities from different merchants, quotes both without submitting, and creates two purchase requests. A member requiring manual approval holds both requests until their own verified approval; both merchants receive exact payments and both ticket pages return 200. An excluded member's balance stays unchanged and their ticket request returns 403. Replaying an identical quote returns the original proposal.
- Inline guards: cumulative insufficient balance, x402 requirements, duplicate participants, out-of-trip dates, changed amounts, changed activity metadata and invalid signatures reject before purchases.
- Expired-quote recovery on real local contracts: an explicit retry of the original submitted quote recovers the existing proposal; an expired, never-submitted quote is rejected without creating a purchase.
- Catalog: six existing merchant tests and 18 signed-quote checks pass; original catalog entries remain unchanged.
- Live model: two real OpenRouter calls return the two correct New York catalog references, merchants and prices without quote, purchase or itinerary calls. Search was not exercised in this smoke.
- No test files were added or modified, as explicitly requested by the user instead of the repository's default new-test requirement.

## Follow-ups
Redeploy API, web and merchants together. The existing merchants deployment must use X402_ENABLED=false for the Arc vault demo; MERCHANT_TEST_UNIT_PRICE_CAP=5000000 remains an optional cap. Obtain fresh quotes after deployment. Browser checks use an explicitly labelled local wallet/API preview; live Google sign-in and production World authentication are not covered by the local flow. Each purchase is independent: a partial failure stops the remaining submissions and preserves the original uncertain quote for explicit recovery.
