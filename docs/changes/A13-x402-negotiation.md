# A13: x402 merchant checkout and agent negotiation

## Summary

Add opt-in x402 v2 exact checkout for signed merchant quotes using Base Sepolia USDC.
Extend the context-aware discovery branch's booking path to validate payment terms
and produce participant-share drafts with an explicit vault-adapter-required status.
Publish tickets only after facilitator settlement, with durable same-header replay
of recorded successful payments.

## Files

- apps/merchants/src/x402.ts: official SDK negotiation, verification, settlement and ticket routes
- apps/merchants/src/{config,runtime,service,store,app}.ts: opt-in configuration, quote payment mode and persistence
- apps/merchants/package.json, bun.lock: official x402 dependencies
- packages/shared/src/{x402,merchants,index}.ts: payment requirements, booking and catalog schemas
- apps/api/src/modules/proposals/{merchants,service}.ts: unsigned negotiation and legacy-payment guard
- apps/api/src/modules/agent/{tools,prompt}.ts, apps/api/src/runtime.ts: agent integration
- apps/merchants/.env.example, README.md, docs/X402.md: setup and flow documentation

## Interfaces touched

- Add optional catalog `payment` metadata and shared x402 schemas.
- Add `POST /x402/bookings/:quoteHash` and `GET /x402/tickets/:id`.
- Add optional `AgentPorts.getPaymentRequirements` and x402 terms/draft tool output.
- Add `X402_ENABLED`, `X402_NETWORK`, `X402_FACILITATOR_URL`.

## Verification

- `mise exec node@24.18.0 foundry@1.5.1 -- bun run check`: pass, including lint and all workspace and scripts typechecks.
- Existing suites: API 166, merchants 6, shared 18, contracts 98 and web 185 tests passed (473 total).
- The earlier default-toolchain Foundry and web-typecheck blockers were resolved by selecting the installed Node 24 and Foundry versions for the check.
- `git diff --check`: pass.
- No new x402-specific tests were added, as requested during implementation; the existing suites were run for the required pre-commit verification.
- A funded facilitator settlement was not executed.

## Follow-ups

- Consent-enforcing Arc-vault-to-x402 payment adapter and approval UI.
- Chain reconciliation for indeterminate settlement outcomes.
- Focused protocol and payment failure-path tests before enabling real payments.
