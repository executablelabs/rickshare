# B9 part 2: automatic ENS lifecycle

## Summary

Provision confirmed Arc trips and new members on Sepolia through an independent
worker. Reserve stable labels before sending, repair partial provisioning on retry,
and publish a bounded public itinerary using the restricted agent signer. ENS
failures persist for retry without rerunning purchases or failing trip confirmations.

## Files

- apps/api/src/modules/ens/service.ts: pinned labels and partial-write recovery
- apps/api/src/modules/ens/store.ts: durable reservations and confirmed metadata
- apps/api/src/modules/ens/coordinator.ts: serialized synchronization and public summaries
- apps/api/src/runtime.ts and index.ts: optional configured ENS lifecycle
- Tests alongside the ENS modules

## Interfaces touched

Use the B9 interface tables and existing ENS configuration. RuntimeOptions supports
an injected ENS coordinator for tests. No route, shared type or money-contract change.

## Verification

- bun run check: pass
- Recovery: failed parent links, address writes, provisioning and publication
- Names: renames, joins, label collisions, restart and confirmed-only projection
- Public records: no ticket bearer links; at most 4096 UTF-8 bytes
- Existing itinerary-only permission and forbidden-key tests retained

## Follow-ups

B9 web displays confirmed names. Live Sepolia transactions require the configured
operator signers and parent setup; automated checks stub the ENS chain.
