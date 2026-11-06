# B10: carry the landing journey through the trip app

## Summary

Rework the authenticated screens around postcards, boarding passes and journey stops using the landing's shared brand components and tokens. Replace the sidebar with a transport-aware top navigation, keep available trip funds in the header, and offer a compact wallet funding card while planning. Preserve transaction, approval and authentication behavior; the related recovery fixes were merged separately.

## Files

- apps/web/src/components/brand: shared navigation, postcard, tape, route, journey track and page states
- apps/web/src/styles/tokens.css and travel.css: shared typography, responsive compositions, contrast and reduced motion
- apps/web/src/components/landing: consume the shared motifs
- apps/web/src/components/shell: boarding-pass trip identity, tabs and editable group names
- apps/web/src/components/trips: postcard collection, readiness journey, funding, balance pass and sheets
- apps/web/src/components/plan and itinerary: conversation, tickets and dated route stops
- apps/web/src/components/money: receipt history and end-of-trip postcard
- apps/web/src/components/ui: accessible currency prefixes, themed sheets and safe avatar fallbacks
- apps/web/src/routes: compose trip, planning, money and invitation screens
- apps/web/src/lib/format-date.ts: consistent dates, retaining the year outside the current year
- docs/changes/travel-overhaul: controlled browser screenshots

## Interfaces touched

None. The name editor uses the existing authenticated profile endpoint. It invalidates the trips query prefix so confirmed identity changes refresh normally. No schema, ABI, backend, authentication or approval-policy changes.

## Verification

- Final combined bun run check: pass (lint, all typechecks, API 182, shared 18, merchants 6, contracts 98 and web 186 tests).
- Production web build: pass.
- Chromium: 390px, 1280px and 1440px navigation, trip collection, Plan, Itinerary, Money, Join, Add money, My limits and creation screens have no horizontal overflow.
- Chromium: calendar opens with selectable days; wallet address copy returns feedback; nickname save refreshes the UI; denied clipboard access exposes the full address; error retry recovers the trip.
- Chromium: empty trip/itinerary states and the signed-out landing were captured at 390px and 1440px for comparison.
- Contrast review: navy text replaces muted text on sky/mint/yellow surfaces; orange descriptions use the dark brand ink; navy-sheet keyboard focus uses yellow.
- Test files unchanged at the owner's explicit request. Existing suites and inline browser checks provide verification.
- Screenshots use isolated fixtures, with signing and transaction sending disabled. They do not prove a funded production purchase.

## Follow-ups

The history API exposes block numbers without timestamps, so receipts retain accurate block metadata instead of inventing relative times. Full live demo readiness still requires the Arc merchant mode, funded transaction signers and the appropriate World accounts/configuration; see the separate recovery and price-cap change records.
