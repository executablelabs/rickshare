# B4 (part 2): trip onboarding, invites, joining and money

## Summary

Inside a trip, Plan opens with a "Get the trip ready" checklist: invite friends (organizer only), verify with World, add money and set my limits. It goes away once everything is done. The organizer creates single-use invite links and lets each friend in by signing the vault's invite. A friend opening the link signs in, waits to be let in, joins from their wallet and picks a display name. Add money and My limits send the member's own prepared transactions and show each step. The money panel shows your balance, wallet funds and the group. On desktop it sits beside the feed from 1280px, and on the Money tab otherwise.

## Files

- apps/web/src/components/trips/{TripActions,MoneySheets,MoneyPanel,InviteSheet,ReadyChecklist}.tsx
- apps/web/src/routes/join.$token.tsx: the join card
- apps/web/src/routes/trips.$tripId*.tsx: load the trip; Plan shows the checklist; Money shows the panel
- apps/web/src/components/shell/AppShell.tsx: trip subtitle, back to trips, All trips and Sign out in the rail; responsive columns
- apps/web/src/components/ui/Sheet.tsx: sheets stack above the mobile tab bar
- apps/web/src/lib/{trips,world,usd-input}.ts: invites, joining, money actions, World popup flow, exact dollar parsing
- apps/web/src/routes/dev.trip.tsx: preview of the trip screen with fixed sample data
- tests: checklist (member vs organizer, disappears when done), add money (order of transactions, wallet limit), limits (cap check, saved values), letting a friend in (typed data with numeric deadline), join (waiting, joining, naming, unusable link), dollar parsing

## Interfaces touched

None. This uses the existing B3, A8 and B8 routes.

## Verification

- bun run check: pass (web 125)
- Headless Chrome on /dev/trip at 390, 1024 and 1440, plus the add money sheet at 390 and 1440. No horizontal overflow.
- World linking needs World credentials (`WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`), which are still blank, so the live popup flow is not yet verified. Until they're set, the API's configuration error is shown as a toast.

## Follow-ups

B7: the Plan feed (chat, live updates, tickets with approve and decline).
