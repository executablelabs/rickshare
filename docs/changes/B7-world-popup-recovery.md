# B7: recover when World verification popups are blocked

## Summary

When the browser blocks the World verification popup, verification now fails promptly with instructions to allow popups and retry. The app no longer navigates away or leaves the approval promise unresolved, so existing error handlers restore the retry action. The allowed-popup verification flow is unchanged.

## Files

- apps/web/src/lib/world.ts: reject a blocked popup before starting verification

## Interfaces touched

None. No backend, provider configuration, wallet, approval attestation or freshness changes.

## Verification

- Frozen dependency installation: pass
- bun run check: pass (lint, all typechecks, API 182, shared 18, merchants 6, contracts 98 and web 186 tests)
- Source formatting and lint: pass
- Inline Chromium proof: blocked popup rejects in 1.1 ms with an actionable error, zero start/network/send calls and unchanged page location
- Inline Chromium proof: allowed popup starts once, validates the polled response, sets the popup authorization URL and closes the popup on completion
- Existing test files remain unchanged at the user's explicit request

## Follow-ups

None.
