# A8: action-bound World human approvals

## Summary

Add the published World human-in-the-loop React/IDKit proof flow to manual member-share approval. Fresh OIDC authentication still has to match the wallet's linked World identity. In proof mode, the API withholds the contract attestation until the exact share's Proof of Human verifies in the configured environment and its nullifier is consumed atomically.

The pending proof expires no later than the authenticated identity's `auth_time` plus `WORLD_MAX_AUTH_AGE_SECONDS`, so completing a slow proof cannot release an attestation after authentication becomes stale. The existing request, proposal and quote deadlines may shorten that window further.

## Interfaces touched

- Additive request states `awaiting_proof` and `processing_proof`, public `humanApproval` challenge metadata, and authenticated same-origin `POST /world/requests/:requestId/proof`.
- Additive `world_proof_nullifiers` table and migration `0010_world_human_approvals`.
- API-only `WORLD_HUMAN_APPROVAL_ENABLED`, `WORLD_PROOF_ENVIRONMENT`, `WORLD_APP_ID`, `WORLD_RP_ID` and `WORLD_SIGNING_KEY`, all listed in `.env.example`. Proof environment defaults to production and supports explicit staging for the World simulator; OIDC configuration is independent.
- Shared challenge schema and SDK-backed proof sheet. Existing contract interfaces and member spending limits are unchanged.

## Dependencies

The official React approval hook, IDKit widget and server signing helper provide the published World proof protocol. AI SDK 5 is a UI-message peer dependency only. SQLite supplies the durable pause for the existing Hono/Bun application; the Vercel Workflow server factory is not installed.

## Verification

Initial validation preceded the staging follow-up. That follow-up initially used lint, typechecking and configuration inspection; merge review additionally ran the checks listed below.

- Full `bun run check` against GitHub main `41331b7`: lint, all typechecks and 508 tests pass (197 API, 189 web, 98 contract, 18 shared, 6 merchant). On this Windows host, supported local Vitest options `--maxWorkers=2 --testTimeout=120000` were supplied without changing committed test configuration or assertions.
- Targeted API identity, proof, signature, binding, replay and cancellation checks pass with stubbed World verification.
- Web approval/onboarding regression checks pass, including backend-confirmation ordering and cancellation before a late SDK result.
- Lint and frozen-lockfile verification pass.
- Production web build passes. Browser previews with the real SDK hook at [390px](A8-human-approval-390.png) and [1280px](A8-human-approval-1280.png) show the exact share, an enabled proof trigger, no horizontal overflow, no runtime errors and no World request before the user clicks.
- The owner's downloaded RP signing key was verified against the supplied signer address and stored in the ignored local API environment and Railway API variables. No key material was printed or added to source. The production feature flag remains false pending deployment and real-user verification.

### Merge review

- Combined with main `5670aba`: full `bun run check` passes with 508 existing tests and unchanged test timeouts, using `VITEST_MAX_WORKERS=2`; production web build passes.
- After the staging follow-up and authentication-age fix: all 197 API tests, 34 focused approval/proof/OIDC/config tests, API typecheck, repository lint and production web build pass. The build includes web typechecking.
- Inline checks verify production/staging isolation, server-selected proof environments, mismatched verifier responses, action/nonce/wallet signal binding and environment-separated nullifier digests.
- Controlled-clock checks reject a proof completed after a 60-second authentication window, accept completion within that window, reject an older authentication timestamp even before request expiry, and reject an already-stale callback. Rejected proofs expose no attestation and consume no nullifier.
- No test files were added or changed during merge review, as explicitly requested by the user.

## Setup and follow-ups

See `docs/WORLD-HUMAN-APPROVAL.md`. The owner supplied the separate app/RP credentials, which are now stored on the API service. Deploy the reviewed API, migration and web code together before enabling proof mode. A real user's complete World-to-contract approval remains the live acceptance check. No human verification is simulated on the production path.
