# Trip dates and location

## Summary

Remove the one-year trip-end restriction from both API validation and the calendar. New trips collect explicit start/end dates and an optional location. The location can be suggested from common city/country names and abbreviations in the title, including `NY 27` → `New York, United States`, and stays editable.

## Implementation

- `Trip` gains additive optional/nullable `startsAt` and `location` fields for legacy compatibility.
- Migration `0009_trip_planning_details` adds nullable planning columns after the already-deployed `0008_trip_gas_sponsorships`; confirmation and projection/metadata refresh preserve them. The snapshot chain includes both schemas.
- Creation accepts any valid future end timestamp, with a supplied start preceding it. The browser requires both calendar dates, allows same-day trips, and imposes no one-year calendar ceiling.
- The start is planning metadata; the existing contract's immutable end remains the settlement deadline. No contract redeployment or ABI change is needed.
- Local destination suggestions are explicitly editable, stop following the title after manual changes, and avoid choosing between multiple recognised cities. Unknown destinations can be entered freely. No geocoding service, API key or paid model call is introduced.
- Cards and the shared trip header show the date range and location. The planner is instructed to use those details from trip state rather than inventing them.
- `/dev/ui` includes the real creation sheet for local layout review.

## Interfaces touched

Shared Trip schema; create-trip request; API SQLite schema/migration; trip projection; typed web client; shared date picker/header props. This is an interface change and requires the dedicated interface review before merge. Existing end-only callers and old trips remain valid.

## Verification

- Shared, API and web TypeScript checks passed. Production Vite build passed after restarting the stopped local preview; the initial workspace build command stalled.
- Local browser review at 390 and 1280px: `NY 27` suggested `New York, United States`; changing the name preserved a manual `Brooklyn, New York` override; the explicit suggestion action restored the inferred location.
- Start/end dates in December 2028 and January 2029 were accepted by the fields, and the January 2029 calendar allowed navigation further forward. No horizontal overflow or JavaScript runtime errors were observed.
- Migration SQL and matching Drizzle snapshot/journal were generated together. No production schema migration or new deployment was performed for this feature.
- Existing home-flow assertions were updated for both dates and inferred location, but no test suites were run, as requested.
- Review captures: [390px](trip-dates-location-390.png) and [1280px](trip-dates-location-1280.png).

## Risk

Financial authorization and member limits are unchanged. Longer end dates extend the user-selected settlement window; available funds retain their existing withdrawal rules. Start dates do not block pre-trip funding. Dates are interpreted in the organizer's local time, consistent with existing end-date handling; destination time-zone lookup is outside this text-location feature.

## Follow-ups

Persisted date/location editing for existing trips and full global location autocomplete are separate features.
