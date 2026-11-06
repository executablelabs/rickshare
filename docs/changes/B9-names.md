# B9 (part 1): ENS trip names with an itinerary-only agent

## Summary

Trips get ENS names under the parent name on ENSv2 Sepolia, e.g. `india-26-3fa2.rickshare.eth`, with a subname for each member and for the agent. Each trip has its own registry (the per-trip subregistry) and its own PermissionedResolver. Names expire when the trip ends, and member names carry no roles, so they cannot be repointed or moved. The agent holds the setText role for the `itinerary` key on its trip's resolver and nothing else.

## Files

- apps/api/src/modules/ens/contracts.ts: ENSv2 Sepolia addresses (from the ENS deployments page), role bits, minimal ABIs
- apps/api/src/modules/ens/names.ts: labels, unique member labels, reserved `agent`, DNS encoding
- apps/api/src/modules/ens/service.ts: parent setup, trip provisioning (idempotent through predicted proxy addresses), agent itinerary write, write simulation
- apps/api/src/modules/ens/chain.ts: Sepolia clients; reverts become `ENS_CALL_REVERTED`
- apps/api/src/modules/ens/cli.ts and `bun run ens`: `setup`, `provision`, `agent-check`
- tests: names.test.ts, service.test.ts (an in-memory ENSv2 with its permission rules)

## Interfaces touched

None. This uses the existing `SEPOLIA_RPC_URL`, `ENS_ADMIN_PRIVATE_KEY`, `ENS_PARENT_NAME` and `AGENT_PRIVATE_KEY`.

## Verification

- bun run check: pass (api 140)
- Sepolia fork (anvil) against the real ENSv2 contracts:
  - setup and provisioning succeed
  - `agent-check` reports itinerary=true; description, url and avatar are false
  - the agent's real itinerary transaction succeeds, and its description transaction reverts
  - the Universal Resolver returns the itinerary text and the trip, member and agent addresses
- Sepolia (live): `bun run ens setup` deployed the parent registry `0x181b050Eb5c51A351e96e4f824c9bA2BD04401c0`, attached it to rickshare.eth, and linked it back to the .eth registry.

## Follow-ups

B9 part 2:

- provision names when a trip is confirmed and members join
- persist names and fill `ensName` in Trip and Member
- the agent writes the itinerary record
- the app shows names
