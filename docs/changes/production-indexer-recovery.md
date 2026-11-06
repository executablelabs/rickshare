# Production indexer recovery

## Cause

Read-only inspection inside the deployed API and merchant containers reproduced HTTP 429 / JSON-RPC `-32005: rate limit exceeded` from `rpc.testnet.arc.io`. Factory discovery, vault logs and contract snapshots were affected. Trip list/get requests wait for indexing, so the same unclassified exception caused generic HTTP 500 responses. Both background scanners logged only generic failure codes, repeatedly attaching error handlers to the same in-flight scan.

## Changes

- Pace Arc requests across clients in each backend process, with at least 600ms between request starts. The queue precedes the HTTP timeout, so parallel snapshots are not prematurely timed out while waiting their turn. Loopback/Anvil endpoints remain unpaced.
- Disable automatic transport retries, including transaction submission retries; a 429 pauses subsequent requests for 15 seconds instead of multiplying the load.
- Back off indexer and merchant scan cycles for 15, 30 and then 60 seconds after throttling. Avoid duplicate timer error handlers for in-flight cycles; log stable rate-limit-specific codes without raw exceptions, URLs or credentials.
- Refresh snapshots only for newly discovered vaults or vaults with decoded events in the batch. Idle batches still scan all known vault logs, check history and commit their cursor atomically. Off-chain names and World linkage retain the separate metadata-refresh path.
- Map nested RPC throttling to typed `503 RPC_RATE_LIMITED` with `Retry-After: 60`, rather than generic internal server errors.
- Configure existing production `INDEXER_POLL_INTERVAL_MS` and `MERCHANT_POLL_INTERVAL_MS` to `10000`; document that public-RPC recommendation in each `.env.example`. Configuration defaults remain unchanged.

## Files

- `apps/api/src/modules/chain/{rpc,clients}.ts`
- `apps/api/src/modules/indexer/service.ts`
- `apps/api/src/lib/errors.ts`
- `apps/merchants/src/{rpc,chain,service,errors}.ts`
- `apps/{api,merchants}/.env.example`

## Verification

- API and merchant TypeScript checks passed; targeted formatting/lint checks passed.
- No test suites run, following the owner's existing instruction.
- Diagnosis used read-only RPC operations and read-only SQLite connections; no production database was reset or edited.
- Deployed API `2d7581ba-f506-4476-8610-0385ac9ab43c` and merchants `4f36420e-b272-4a16-acc8-c8385d18a936`; both Railway releases succeeded. Existing database volumes were retained.
- Post-deployment read-only inspection: API cursor advanced from `71061332` to `71065011` with head `71065020`; merchant cursor was `71064999` with head `71065024`.
- A fresh, independently owned diagnostic account completed real SIWE sign-in (200), authenticated `GET /api/trips` (200, approximately 4.6 seconds) and logout (200). No trip changes, purchases or transfers were made.
- A subsequent three-minute log window contained no indexer or merchant scan failures. Each scanner initially encountered one rate-limit event during startup and subsequently recovered.

## Risk

No change to authorization, share accounting, cursor atomicity or merchant fulfillment rules. Pacing can add latency during bursts; throttling is explicitly retryable. Existing pending scan and delivery work remains durable. Public-RPC quotas still apply; a dedicated endpoint may be needed at higher traffic.
