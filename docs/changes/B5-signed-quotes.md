# B5 (follow-up): signed quote bindings

## Summary

Track A's interface handoff added `SignedQuote`, which carries the vault, chain
and location that a merchant's signature covers, and A9 verifies quotes with it.
The agent parsed quotes with the v0 `Quote` schema, which strips those fields, so
every proposal would have failed verification. Quotes are now kept as
`SignedQuote`, and `get_quote` also checks the quote against this trip's vault
and the merchant's listed address before it can be proposed.

## Files

- apps/api/src/modules/agent/tools.ts: `SignedQuote`, catalog, vault and payee
  checks in `get_quote`; the `getQuote` port returns `unknown`, validated here.
- apps/api/src/modules/agent/schemas.ts, sources.ts: shared `MerchantCatalog`.
- apps/api/src/modules/agent/test-fixtures.ts, tools.test.ts: signed fixtures and
  tests.

## Interfaces touched

`AgentPorts.getQuote` returns `unknown` and `submitProposal` receives a
`SignedQuote`, matching A9's `ProposalService.submitProposal` input.

## Verification

- bun run check: pass (api: 88 tests).
- New tests refuse quotes for another vault, a payee other than the listed
  merchant, a merchant outside the catalog, and a quote without vault binding.

## Follow-ups

- B6: wire `getQuote` to A10's quote route (it also needs `vaultAddress` and a
  start time) and `submitProposal` to A9's service.
