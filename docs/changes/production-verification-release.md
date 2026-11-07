# Production verification recovery release

## Summary

Collect the deployed approval-expiry, limits-refresh, scoped World identity and asynchronous purchase-recovery fixes into a reviewed release. Restore the saved production Agent Pass issuer/client/secret, and align human-proof validation to production for a regular World ID end-to-end attempt.

## Configuration

- `WORLD_ISSUER=https://auth.world.org`; matching production client ID/secret restored from the existing Railway backups using secure stdin.
- `WORLD_REDIRECT_URI=https://rickshare.xyz/api/world/callback` remains the registered callback.
- `WORLD_PROOF_ENVIRONMENT=production`; `WORLD_HUMAN_APPROVAL_ENABLED=true` and existing app/RP/signing configuration remain required. No verification check or freshness requirement is disabled.
- Sandbox links remain in the additive scoped table. Existing production links remain in the legacy table, allowing a return to the original identity namespace.

## Verification before release

- Three independent agents covered configuration restoration, backend safety/typechecks, and frontend review/build.
- API, shared, merchant and web TypeScript checks passed; targeted Biome and whitespace checks passed.
- Production Vite build passed. Dependency worker-thread browser-externalization warnings remain informational.
- Read-only local layout captures at 390 and 1280px had no page errors or horizontal overflow. These are layout evidence, not a completed World or wallet journey: [390px](approval-release-390.png), [1280px](approval-release-1280.png).
- No local test suites were run, following the owner's explicit instruction. Existing CI configuration is unchanged.

## Merge authorization and risk

The owner explicitly requested committing, merging and deploying this release, overriding the repository's default human-only merge and local full-test workflow for this iteration. Use a merge commit, not squash. The interface and database changes are additive. Financial consent, wallet/share binding and replay protection remain enforced.

A successful production World human-verification journey is not established by configuration, compilation or health checks. After deployment, the owner must complete the production World app flow, human proof and their own wallet confirmation. Provider-side failure remains possible; preserve reference codes and sanitized transaction status when diagnosing it.
