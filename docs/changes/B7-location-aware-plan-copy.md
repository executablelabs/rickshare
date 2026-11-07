# B7: location-aware planning copy

## Summary

The empty Plan view now uses the saved trip location in its heading, introduction, suggested prompts and composer placeholder. Trips without a location get destination-neutral prompts and a reminder to share where they are heading. The examples no longer assume Goa, a two-day stay, Saturday morning or a fixed budget.

## Files

- apps/web/src/components/plan/Feed.tsx: destination-aware empty-state copy and prompt chips with wrapping for long locations.
- apps/web/src/components/plan/Composer.tsx: optional location prop and destination-aware placeholder.
- apps/web/src/routes/trips.$tripId.plan.tsx: pass saved trip location to the composer.
- apps/web/src/components/plan/Plan.test.tsx: align the existing send-flow scenario's text literals with the new generic prompt; no test cases or assertions added or removed.
- docs/changes/B7-plan-location-390.png: mobile location preview.
- docs/changes/B7-plan-location-1280.png: desktop location preview.
- docs/changes/B7-plan-location-fallback-390.png: mobile preview without a saved location.

## Interfaces touched

Composer accepts an optional nullable location prop. No API, shared schema, database or environment changes.

## Verification

- Repository lint: passed.
- Web typecheck: passed.
- Browser preview: inspected the actual components at 390px and 1280px with Lisbon, Portugal, plus the missing-location fallback at 390px. Clicking a location suggestion populated the composer with that same destination. No browser errors or horizontal overflow; a 160-character location also wrapped without overflow.
- No new tests or test-suite runs, as requested. This is an explicit exception to AGENTS.md's test and full-check requirements for this copy-only change; the existing send-flow test's copy literals were kept in sync.
- CI identified one remaining old prompt in the mocked chat response. That fixture now matches the submitted generic prompt; the existing assertions are preserved.

## Follow-ups

None.
