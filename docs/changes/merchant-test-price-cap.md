# merchant-test-price-cap: cap optional test ticket prices

## Summary

Add an optional merchant test unit-price cap without changing normal catalog prices. The merchant builds its catalog once with the cap, so advertised prices and newly signed quotes agree. Existing stored quotes and merchant recipients stay unchanged.

## Files

- apps/merchants/src/config.ts: validate an optional positive base-unit cap
- apps/merchants/.env.example: document the cap
- apps/merchants/src/runtime.ts: pass the configured cap into the merchant
- apps/merchants/src/service.ts: cap catalog unit prices before catalog and quote use

## Interfaces touched

None. Existing catalog and quote response shapes are unchanged.

## Verification

- Existing merchant tests: 6 passed.
- Inline: default/capped catalog, lower-price preservation, micro-USDC precision, HTTP quote totals and real EIP-712 signatures, unchanged payees and stored quotes, rejected client price overrides, runtime wiring and configuration validation passed.
- bun run check: pass (lint, all typechecks, contracts, 186 web tests, 182 API tests, 18 shared tests and 6 merchant tests).
- No test files added or edited, as explicitly requested.

## Demo operator setup

Set `MERCHANT_TEST_UNIT_PRICE_CAP=5000000` in the merchant service to cap each unit at $5, then restart it and request new quotes. This is a unit-price cap: quantity multiplies the total, and it does not authorize anyone's share. Leave the variable blank to keep the normal $25, $42 and $60 prices. Existing quotes retain their original signed prices.

For the existing Arc group-fund flow, also set `X402_ENABLED=false` before requesting new quotes. The test price cap does not provide the missing Arc-to-x402 payment adapter, fund wallets or replace World authentication.

## Follow-ups

None.
