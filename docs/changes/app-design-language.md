# App design language: carry the landing identity into trip pages

## Summary

Use `b/landing-redesign` as the source for the landing composition and shared design direction. Extend its cream surfaces, navy controls, warm borders, typography and radii across authenticated pages through existing shared tokens and components.

## Files

- Landing and brand files from the existing `b/landing-redesign` branch, retaining their commit history.
- `apps/web/src/styles/tokens.css`: shared palette, control/card radii and restrained shadows.
- `apps/web/src/components/landing/landing.css`: reference shared palette tokens instead of repeating values.
- `apps/web/src/components/ui/Button.tsx`: navy primary controls matching the landing.
- `apps/web/src/components/trips/{Home,TripCard}.tsx`: orange entry header, generous spacing and defined card surfaces.
- `docs/{DESIGN,DESIGN-LANGUAGE}.md`: align the product guidance with the owner-requested application-wide direction.

## Interfaces touched

Visual tokens and the existing optional transport wordmark prop. No API, database, contract or authorization changes.

## Verification

- Manual responsive browser review and production build recorded in the PR.
- Existing test files from the source branch are preserved; no tests were added or edited during this extension, as requested by the owner.
- Financial status colors, stamp labels, original in-app rickshaw, money formatting and transaction flows retain their existing behavior.

## Follow-ups

None for this visual extension. It does not claim completion of the separate B10 accessibility acceptance criterion.
