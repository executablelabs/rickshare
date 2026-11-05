# Track A API handoff

## Wallet sessions (A6)

All browser writes send `Origin: WEB_ORIGIN`; browser requests include cookies
with `credentials: include`. Sessions are opaque, HttpOnly and revocable. HTTPS
origins use Secure cookies; local HTTP development uses non-Secure cookies.

1. GET `/auth/nonce` returns `{ nonce }` and an HttpOnly challenge cookie.
2. Construct a SIWE v1 message for chain 5042002, `domain` equal to the web
   origin's host and `uri` equal to the exact web origin. Include current
   `issuedAt` and the returned nonce; sign it using the user's wallet.
3. POST `/auth/verify` with `{ message, signature }` returns
   `{ address, expiresAt }` and sets the session cookie. The nonce is single-use
   and bound to the requesting browser's challenge cookie.
4. GET `/auth/session` returns that same public session shape, or 401.
5. POST `/auth/logout` revokes the server-side session and clears the cookie.

The verifier supports EOA and EIP-1271 wallet signatures through viem's Arc
client. An ordinary login never authorizes a payment: A8 separately requires
fresh World authentication before issuing an onchain approval attestation.

Every error uses `{ error: { code, message } }`. Integration endpoints fail with
a configuration error when their required real credentials are missing; the
health endpoint remains available without external credentials.

## Chain projections and events (A7)

The canonical trip ID is the lowercase vault address. Proposal IDs are decimal
strings scoped to that trip. Indexing starts at ARC_START_BLOCK, persists a
finalized-block cursor, and commits chain logs, projections and notifications in
one SQLite transaction. Only the configured factory's vaults are indexed.

GET `/trips/:tripId/events?after=0&limit=100` returns `{ events }`, where each
entry has `{ id, tripId, data }` and data is a shared TripEvent. This endpoint
requires a wallet session and trip membership. The cursor is a durable decimal
event ID, not a block timestamp. Payloads contain base-unit decimal strings.

Track B can consume `IndexerService.getTrip`, `proposals`, `events`,
`requireMember`, and `bus.subscribe`. The bus publishes after database commit;
reconnects must replay the durable event table. For SSE, subscribe first, buffer
notifications while replaying pages after Last-Event-ID, then send only buffered
IDs greater than the replay cursor before switching to live delivery.

The chain remains the money source of truth. Direct token transfers are never
credited as vault deposits, and Arc's native/system token Transfer events are
not counted a second time. Unexpected finalized-history changes stop indexing
instead of silently serving a rewritten financial history.
