# Landing redesign: a shared journey

## Summary

Replaced the signed-out landing with an orange, cream and navy marketing experience built around planning together and individual financial control. Custom rickshaw, bus, Electric Express and plane marks share the existing brand geometry, with the navigation logo and a minimal circular-stop journey indicator responding to section visibility. Orange-section text uses warm near-black espresso, with a cream highlight behind the personal-share headline.

Electric Express is the selected train: one streamlined carriage with an overhead wire and pantograph, without visible wheels. Temporary train alternatives and their comparison route were removed after selection. The authenticated application, original rickshaw assets and real sign-in actions are retained.

## Files

- `apps/web/src/components/brand/{TrainMark,TransportMark,Wordmark}.tsx` and `transport-mark.css`: canonical transport family, reusable opt-in wordmark and reduced-motion transitions.
- `apps/web/src/components/landing/`: four responsive marketing sections, real proposal-ticket previews, isolated approval/decline demonstration, mobile navigation, circular-stop journey rail and scoped visual tokens.
- `apps/web/src/components/landing/Landing.test.tsx`: existing copy assertions updated for the new headline and planning section.
- `docs/DESIGN-LANGUAGE.md`: agreed marketing identity, selected train, colors, typography, page composition, journey behavior, motion and implementation rules.
- `docs/DESIGN.md`: direct readers to the current marketing guide while preserving the authenticated product rules.

## Interfaces touched

Optional `vehicle` prop on `Wordmark`. No API, contract, environment or authentication interfaces changed.

## Design decisions

The requested marketing language intentionally expands the older landing restrictions in `docs/DESIGN.md`. Colorful full-height sections, larger display typography, travel details and restrained entrances use marketing-scoped tokens; product screens keep their established design. All previews are labelled examples; the interactive demonstration cannot invoke the API, a wallet or a payment.

The journey rail contains four circle stops with just the active vehicle travelling between them. Visible counters, captions, numbered stops, Explore arrows and inactive transport icons are intentionally absent.

## Verification

- Earlier implementation iterations: web TypeScript and production build passed; the existing landing/brand suites passed before tests were deferred.
- Earlier browser review at 360, 390, 768 and 1280px: no horizontal overflow or JavaScript runtime errors. Logo states, mobile navigation, approval/decline/reset, clickable journey stops and reduced motion were verified.
- Finalization: tests and `bun run check` were not run, as explicitly requested by the owner. Final cleanup was reviewed through the source diff.
- Latest refinements remain local; no new Railway deployment was requested or performed during finalization.

## Risk

None to financial authorization. The owner requested committing this visual iteration without rerunning tests, overriding the repository's usual pre-commit full-check workflow for this commit.

## Follow-ups

Resume full checks when requested. The decorative destination photo is delivered from Unsplash.
