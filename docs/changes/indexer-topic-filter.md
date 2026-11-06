# Indexer: read vault logs without combined topic filters

## Summary

Fetch logs filtered by each known vault address and decode them locally against the existing ABI. The public Arc RPC rejects the previous combined event-topic filter with `-32012: requested range too large`, even for a single block, preventing indexing after trip creation.

## Files

- `apps/api/src/modules/indexer/source.ts`: replace ABI-wide topic filtering with address-only reads and strict local decoding.

## Interfaces touched

None. The index source output, block bounds, event ordering, authorization and financial accounting are preserved.

## Verification

- Before the change, the exact reported vault fails log fetching even over one block; address-only and single-event queries succeed over 200 blocks.
- The changed `createIndexSource` successfully reads the same vault over one-block and 200-block windows, preserving event order.
- The changed implementation successfully loads that vault through `TripService.get` and an in-memory indexer using the real Arc RPC. All remote operations are reads.
- `bun run check`: 185 web, 155 API, 98 contract, 18 shared and 6 merchant tests pass, including the existing Anvil-backed API integration flows.
- No test files are added or edited, as requested by the owner.

## Follow-ups

Handle RPC throttling with a typed retryable error and surface pending indexing in the frontend separately. Those changes are outside this narrowly scoped fix.
