# World sandbox identity scope

## Summary

Sandbox OIDC identities use an additive table keyed by issuer, client and lowercase wallet address. Production and other legacy issuers retain their existing identity table. Sandbox requests also use scoped flow IDs so callbacks, proof challenges and saved results cannot resume across the environment boundary.

## Files

- apps/api/src/db/schema.ts: add world_scoped_identities with a unique scoped subject hash.
- apps/api/drizzle/0011_world_sandbox_scope.sql and generated metadata: additive table and unique index only.
- apps/api/src/modules/approvals/service.ts: shared active-scope identity lookup, transactional linking and scoped sandbox flow IDs.
- apps/api/src/modules/indexer/service.ts: optional identity callback for snapshots, metadata refresh and current trip linkage flags.
- apps/api/src/runtime.ts: wire the same lookup into chain snapshots and the indexer without constructing the World service recursively.

## Interfaces touched

Additive database table and optional indexer constructor callback. Public request and response shapes are unchanged.

## Verification

- API TypeScript check: passed with --noEmit --incremental false.
- Biome checks for the four changed TypeScript files: passed.
- Drizzle migration generated and SQL reviewed; no migration was applied.
- Tests and live authentication were not run, as requested.

## Risk and remaining steps

Apply migration 0011 through the normal deployment startup before sandbox identity lookups run. Configure the sandbox issuer and its matching client credentials together; the exact issuer is https://sandbox.auth.world.org. Keep the existing IDKit staging proof configuration. Users must explicitly link a fresh sandbox identity. Previous production requests cannot be resumed while sandbox is active and require a new attempt. Existing production identity rows are preserved for switching back. Live sandbox completion remains unverified.

## Release verification

- API deployment `ce64a92f-e641-4049-92f3-699bc7461b47` and web `5ea349cb-cd85-49a1-9c65-11ac5b791a01` succeeded. Public health endpoints returned 200.
- OIDC issuer/client/secret were changed together using secure stdin, preserving the previous production settings in operator-only Railway backup variables. No credential values were logged or committed; the proof environment remains staging.
- A fresh independently owned diagnostic session obtained a World link-start response (200) whose authorization host was `sandbox.auth.world.org`, callback was the exact Rickshare callback, and client matched the new registration. The request was cancelled (200) and session logged out (200), without navigating to World or performing a human verification.
- Read-only database inspection confirmed the new scoped table exists and the existing legacy production identity record remains present. Users still need to complete a fresh sandbox link; no full sandbox authentication or protected-action success is claimed.
