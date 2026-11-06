# Trip controls: choose dates and copy the funding address

## Summary

Add a shadcn-style Popover and Calendar date picker to the existing trip-end field. Preserve local calendar dates and expose the signed-in wallet's funding address before create, join and deposit transactions.

## Files

- `apps/web/src/components/ui/DatePicker.tsx`: accessible calendar with future-date bounds and 44px day controls.
- `apps/web/src/components/trips/FundingAddress.tsx`: full read-only address, copy action and selectable fallback.
- Create trip, join and add-money views: mount the controls within existing flows.
- `apps/web/src/styles/tokens.css`: reserve room for the custom calendar trigger.
- `apps/web/package.json`, `bun.lock`: pinned Radix Popover and React DayPicker dependencies needed for the requested picker.

## Interfaces touched

None. Transaction preparation, membership checks and backend date validation are unchanged.

## Verification

- Browser: calendar selection preserves the local date and closes the popup; Escape retains the trip sheet.
- Browser: copying returns the connected wallet address; 360, 390, 768 and 1280px layouts have no horizontal overflow.
- Screenshots: `B10-calendar-{390,1280}.png`, `B10-funding-{390,1280}.png`.
- Existing checks and production build recorded in the PR. No test files added or edited, as explicitly requested by the owner.

## Follow-ups

Live auto-funding is not implemented: deployer transfers exist only in the demo seed script. The reported production trip-read failure remains under investigation; it is outside this UI change.
