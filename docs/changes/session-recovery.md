# session-recovery: recover an expired sign-in

## Summary

Keep the session returned by verification fresh so completing sign-in does not immediately start another session request. Bound authentication requests to 15 seconds, stop polling signed-out sessions, and discard private cached data and requests when a session expires or a protected query returns 401. Recovery still requires an explicit signature and preserves account checks and logout ordering.

## Files

- apps/web/src/auth/session.tsx: session freshness, expiration and private-cache cleanup
- apps/web/src/lib/auth.ts: bounded authentication requests

## Interfaces touched

None.

## Verification

- Existing session, auth and HTTP tests: 19 passed.
- Controlled browser: successful verification stays signed in with a stalled follow-up session check; repeated clicks request one signature.
- Controlled browser: protected-query 401 clears private caches before retries; canceled session and private-query responses cannot overwrite a new sign-in.
- Controlled browser: all four authentication requests abort on their configured 15-second deadline, accelerated for verification.
- Test files unchanged as explicitly requested; new recovery scenarios were checked inline.
- bun run check: pass (lint, all typechecks, contract tests, 186 web tests, 182 API tests, 18 shared tests and 6 merchant tests).

## Follow-ups

None.
