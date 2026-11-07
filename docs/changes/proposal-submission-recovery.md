# Proposal submission timeout recovery

## Cause
The browser cancelled the affected proposal POST at its explicit 45-second timeout; Railway recorded HTTP 499 after about 44.9 seconds. Production's durable submission journal nevertheless recorded the transaction as confirmed and assigned proposal 6. The old route waited for transaction confirmation and then a complete indexer sync before replying.

## Changes
- Confirmed submissions respond without waiting for indexing. Indexing continues independently.
- Work exceeding an eight-second HTTP response budget returns 202 with the reviewed quote hash. A member-scoped, uncached GET `/trips/:tripId/proposal-submissions/:quoteHash` reports processing/confirmed/unconfirmed state.
- The browser checks that same submission rather than keeping a single 45-second write request open. Bounded polling preserves the reviewed quote when the outcome remains uncertain.
- Identical in-flight submissions share one task. Conflicting terms for the same quote are rejected. Queued work copies the reviewed quote and shares before processing.
- Confirmed rows and indexed Proposed events reconcile lost responses without rebroadcasting. The agent transaction queue, durable intent checks and contract quote replay protection remain intact.

## Interfaces touched
Additive 202 proposal response and authenticated GET submission-status route. Existing quick 201 responses remain compatible. No contract or financial authorization changes.

## Verification
- API and web TypeScript checks passed during implementation; test suites remain deferred by owner instruction.
- Read-only production inspection confirmed proposal 6 exists despite the browser's timed-out response. No diagnostic purchase or payment was submitted.
- API and web releases `ce64a92f-e641-4049-92f3-699bc7461b47` and `5ea349cb-cd85-49a1-9c65-11ac5b791a01` succeeded; public health returned 200.
- Read-only invocation of the deployed submission-status reader returned confirmed proposal 6 in approximately 7ms, without an indexer sync or broadcast. A new live purchase was not initiated for verification.

## Risk
Processing can still take longer when RPC or the transaction queue is busy, but a pending response is no longer presented as a failed purchase. The client retains uncertain requests for reconciliation and never automatically substitutes a fresh quote. Accepted in-memory work lost before a durable row is created can be retried with that same quote; existing recorded attempts are never blindly resent.
