# B8: itinerary and private tickets

## Summary

Show the itinerary in chronological order, grouped by the member's local calendar day. Paid bookings remain visible even when the planner has not added them to the outline, and only participants see a ticket action. Ticket URLs are retrieved on demand through the existing participant-only endpoint; group itinerary URLs are never opened.

## Files

- apps/web/src/components/itinerary/Itinerary.tsx and Itinerary.test.tsx: schedule, states and ticket access
- apps/web/src/lib/itinerary.ts: validated itinerary query
- apps/web/src/routes/trips.$tripId.itinerary.tsx: connect the itinerary page
- apps/web/src/components/plan/Feed.tsx: reuse the existing private ticket button
- apps/web/src/components/trips/TripActions.tsx and routes/trips.$tripId.plan.tsx: one trip stream across all tabs

## Interfaces touched

None. Uses the existing itinerary, proposals, stream and participant ticket routes.

## Verification

- bun run check: pass
- Web production build: pass
- Tests: chronological grouping, local dates, streamed refresh, private ticket access, empty state and error retry
- Headless Chrome: actual route at 390px, 768px and 1280px with stubbed API and wallet; no horizontal overflow or runtime errors
- No live wallet transactions or paid API calls

## Follow-ups

B8 Money is a separate PR to keep the itinerary and wallet-action reviews focused. B10 for the broader accessibility and live demo pass.
