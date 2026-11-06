# B4: app-funded trip creation

## Summary

Fund the organizer's creation fee before returning the transaction for wallet confirmation. The organizer still signs the factory call and owns the new trip. Persist signed funding transfers before broadcast so retries and restarts do not pay twice, and cap app spending per request, wallet and UTC day.

This puts the manually deployed gas-funding implementation in source control. A later main-only deployment had dropped that implementation while retaining the sponsor key, leaving new users with unsigned creation transactions and no gas balance.

## Files

- `apps/api/src/modules/trips/gas-chain.ts`, `gas-chain.test.ts`: estimate gas for an empty wallet and sign, broadcast and confirm native-USDC funding.
- `apps/api/src/modules/trips/gas-sponsor.ts`, `gas-sponsor.test.ts`: durable funding, retries, nonce serialization and allowance budgets.
- `apps/api/src/modules/trips/service.ts`, `trips.test.ts`: require successful funding and reuse unfinished requests.
- `apps/api/src/runtime.ts`: dedicated sponsor wiring.
- `apps/api/src/config.ts`, `config.test.ts`, `apps/api/.env.example`: key and validated budget settings.
- `apps/api/src/db/schema.ts`, `apps/api/drizzle/0008_trip_gas_sponsorships.sql`, `apps/api/drizzle/meta/_journal.json`: additive funding journal.
- `apps/api/src/integration/flow.test.ts`: an empty organizer wallet receives app funding, creates its own vault and signs invitations.
- `apps/web/src/components/trips/CreateTripSheet.tsx`, `Home.test.tsx`: fee-coverage copy and no wallet prompt when funding fails.
- `README.md`: local and Railway configuration and release verification.

## Interfaces touched

Additive API config and SQLite table; existing HTTP response shapes, shared schemas and contract interfaces are unchanged. The new environment variables are `GAS_SPONSOR_PRIVATE_KEY`, `GAS_SPONSOR_MAX_FEE_USDC` (default `1`) and `GAS_SPONSOR_DAILY_BUDGET_USDC` (default `10`). A configured sponsor is now required for trip creation.

## Verification

- `bun run check` with Foundry 1.5.1 and local Vitest execution options `--maxWorkers=2 --testTimeout=120000`: lint, all typechecks and all 479 tests pass (171 API, 186 web, 98 contract, 18 shared, 6 merchant). The normal local run encountered existing 20-second UI-import timeouts; no assertions or committed test configuration were changed.
- Focused chain, sponsor and trip-service tests: 20 pass.
- Local Anvil integration: a wallet starting with zero native balance receives funding and creates the vault as its owner.
- Production regression reproduced: API deployment `2d7581ba-f506-4476-8610-0385ac9ab43c` returned a creation transaction while leaving a fresh wallet at zero, despite the sponsor key being configured.
- Restored production deployment `64f84e82-112c-46f5-9b55-1d154e3a687e`, based on `0244f7b` plus this implementation: a fresh wallet received `0.19972525` USDC before submitting any creation transaction. This diagnostic did not complete an embedded-Privy confirmation.
- Browser screenshots: [390px](B4-gas-sponsorship-390.png) and [1280px](B4-gas-sponsorship-1280.png), using the real creation sheet with a local test wallet. No horizontal overflow or runtime errors.

## Follow-ups

Keep the sponsor key in Railway's API variables and fund the dedicated wallet. Gas allowances are ordinary funds, remain in the user's wallet after cancellation, and the sponsor additionally pays each funding transfer's fee. Privy's confirmation may still display the network fee; the allowance covers it. Other wallet actions retain their existing fee flows.
