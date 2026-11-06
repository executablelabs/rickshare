# B9 part 2: show confirmed group names

## Summary

Load authenticated trip state into the shared shell and show the trip's confirmed
ENS name below its title. Group names expands to show member display labels,
confirmed member names and the agent name. Unprovisioned trips retain their labels.

## Files

- apps/web/src/lib/trips.ts: validated requests and account/trip query keys
- apps/web/src/routes/trips.$tripId.tsx: queried trip shell
- apps/web/src/components/shell/: trip identity and expandable group names
- Tests and B9-web-{390,1280}.png captures

## Interfaces touched

Consume the existing authenticated trip endpoint and nullable ensName fields.
AppShell gains an optional tripEnsName prop. No API, shared schema or env changes.

## Verification

- bun run check: pass
- Web production build: pass
- Tests cover confirmed names, pending fallback, API errors and header integration.
- Headless Chromium with test-only wallet/API fixtures: 390x844 and 1280x800,
  no horizontal overflow or runtime errors; captures reviewed.

## Follow-ups

B4 adds onboarding, member profile editing, funding and personal limits.
