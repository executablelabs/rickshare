# B2: honor the configured RPC in Privy wallet requests

## Summary

An explicit VITE_ARC_RPC_URL now supplies Privy's wallet RPC override as well as the chain default. Privy can otherwise prefer its dashboard RPC and continue using a throttled public endpoint despite the application configuration. Unconfigured applications retain the existing chain defaults.

## Files

- apps/web/src/auth/PrivyWallet.tsx: explicit wallet RPC override

## Interfaces touched

None. Existing environment variable, chain ID, signing, transaction deduplication and receipt recovery remain unchanged.

## Verification

- Full bun run check: pass, 508 existing tests (197 API, 189 web, 98 contracts, 18 shared and 6 merchants), with VITEST_MAX_WORKERS=2 locally. Existing wallet and transaction tests are included; their targeted baseline also passed all 11 tests.
- Manual check of the actual patched chain expression and installed Privy 3.51.3 RPC selector: seven assertions confirm the precedence issue, explicit override selection, unchanged chain ID and unchanged unconfigured behavior.
- Production web build, Biome and diff checks: pass.
- One read-only chain-ID request to each existing Blockdaemon, dRPC and QuickNode alternative returned HTTP 200 and Arc testnet chain 5042002. These public endpoint checks do not guarantee future availability or remove provider quotas.
- No test files added or modified, per the user's explicit instruction.

## Follow-ups

Set VITE_ARC_RPC_URL to a browser-safe Arc testnet endpoint on the web service and rebuild it. The value is public; use provider-supported origin restrictions rather than server-only credentials. API and merchants ARC_RPC_URL settings are separate. This routing fix cannot remove the configured provider's rate limits; it makes the application's explicit choice effective.
