# App design language: carry the landing identity into trip pages

## Summary

Use `b/landing-redesign` as the source for the landing composition and shared design direction. Extend its cream surfaces, navy controls, warm borders, typography and radii across authenticated pages through existing shared tokens and components. Overhaul the trip navigation frame, page hierarchy, planning conversation, itinerary timeline, balance summary, join card and sheet presentation without changing transaction or data behavior.

## Files

- Landing and brand files from the existing `b/landing-redesign` branch, retaining their commit history.
- `apps/web/src/styles/tokens.css`: shared palette, control/card radii and restrained shadows.
- `apps/web/src/components/landing/landing.css`: reference shared palette tokens instead of repeating values.
- `apps/web/src/components/ui/Button.tsx`: navy primary controls matching the landing.
- `apps/web/src/components/trips/{Home,TripCard}.tsx`: orange entry header, generous spacing and defined card surfaces.
- `apps/web/src/components/shell/AppShell.tsx`: framed desktop navigation and refined mobile tab surface.
- Plan, Itinerary and Money views: consistent visible page headings, planning surfaces, day timeline and navy balance summary.
- Join and shared sheets: branded entry treatment, consistent surfaces and spacing.
- `docs/{DESIGN,DESIGN-LANGUAGE}.md`: align the product guidance with the owner-requested application-wide direction.

## Interfaces touched

Visual tokens and the existing optional transport wordmark prop. No API, database, contract or authorization changes.

## Verification

- Full `bun run check`: 185 web, 155 API, 98 contract, 18 shared and 6 merchant tests pass.
- Web production build passes; generated ABI and route tree remain unchanged.
- Chrome: landing navigation and approval demonstration, trip tabs, join, deposit sheet, calendar selection and Escape behavior reviewed with signing disabled.
- No horizontal overflow at 390px or 1280px; the calendar also fits at 360px and 768px. Reduced-motion preference verified.
- Fourteen viewport screenshots under `docs/changes/design-{landing,home,plan,itinerary,money,join,sheet}-{390,1280}.png` are embedded in the PR.
- Existing test files from the source branch are preserved; no tests were added or edited during this extension, as requested by the owner.
- Financial status colors, stamp labels, original in-app rickshaw, money formatting and transaction flows retain their existing behavior.
- No API, database, environment, contract, query, transaction or authentication logic changed in the visual overhaul.

## Follow-ups

None for this visual extension. It does not claim completion of the separate B10 accessibility acceptance criterion.
