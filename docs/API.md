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

## World linking and payment approval (A8)

Register an OIDC application with World and set WORLD_ISSUER,
WORLD_CLIENT_ID, WORLD_CLIENT_SECRET and WORLD_REDIRECT_URI. The callback is the
API's `/world/callback`, not a frontend route. Configure VERIFIER_PRIVATE_KEY to
match the immutable verifier in the deployed vault. No test identity provider is
enabled by runtime configuration.

- GET `/world/status`: authenticated `{ linked }`.
- POST `/world/link/start`: starts initial identity linking and returns
  `{ requestId, authorizationUrl }`.
- POST `/trips/:tripId/proposals/:proposalId/approval/start`: starts a fresh
  World verification for the current wallet's exact purchase share. A previous
  World link is required. Members cannot request an attestation for somebody else.
- GET `/world/callback`: consumes the session-bound OAuth state once, verifies
  the code/token, and redirects to WEB_ORIGIN with `world_request` and
  `world_status` query parameters. These query parameters are informational;
  the frontend must poll the authenticated request endpoint for the actual result.
- GET `/world/requests/:requestId`: `{ status, errorCode, attestation }`.
- POST `/world/requests/:requestId/cancel`: cancels a pending/in-flight request.

Request statuses include pending, processing, verified, cancelled, failed and
expired. An approval result includes vaultAddress, proposalId, member, amount,
nonce, deadline, chainId and signature. Pass proposalId, nonce, deadline and
signature to the vault's `approve` function using the same participant wallet.
World verification does not send a transaction or spend money by itself.

World calls use authorization-code flow with PKCE, one-time state and nonce,
prompt=login and max_age=0. ID tokens require a trusted RS256 JWKS signature,
correct issuer/audience/authorized party, expiry, nonce and fresh auth_time.
Approval identity must match the wallet's immutable linked subject. Raw World
subjects and ID tokens are never returned to clients; PKCE verifiers are
encrypted at rest. The signup flow should link World before the first deposit.

## Mock merchants (A10)

The merchant app runs on its own origin (8790 by default):

- GET `/catalog`: three operators/items; configured operators include their
  actual signing/payment address. Unconfigured keys never get invented addresses.
- POST `/quotes`: `{ merchantId, itemId, vaultAddress, quantity, startsAt }`.
  Returns SignedQuote with vaultAddress, chainId, location, exact base-unit total,
  quoteHash and EIP-712 signature. Prices/title/location/payee come from the
  configured catalog, not request fields. The vault must belong to the configured
  factory and allow that merchant.
- GET `/tickets/:token`: paid ticket HTML and a locally rendered QR code.
- GET `/internal/tickets/:vault/:proposalId`: immutable ticket bundle, payload
  and hash, requiring `Authorization: Bearer MERCHANTS_API_SECRET`.

The API and merchant process share MERCHANTS_API_SECRET through their ignored
environment files. Browser clients do not receive this secret. A9's ticket
endpoint authenticates the participant and verifies the bundle hash against the
chain before returning the ticket URL.

Merchant quotes, prepared tickets, delivery jobs and scan cursors are durable.
On restart, queued jobs resume even after the block cursor advanced. If a
fulfillment receipt was lost, the worker checks the persisted ticket hash
against the paid onchain proposal before retrying. Tickets stay unavailable
until the chain confirms payment for that exact payload.

## Proposal submission and tickets (A9)

- GET `/merchants`: authenticated merchant catalog.
- POST `/trips/:tripId/quotes`: authenticated trip-member proxy for a merchant
  quote; body is merchantId, itemId, quantity and startsAt. The trip path supplies
  the vault address.
- GET `/trips/:tripId/proposals`: authenticated `{ proposals }` projection.
- POST `/trips/:tripId/proposals`: `{ quote: SignedQuote, shares: [{ member,
  amount }] }`, where amount is a decimal string of USDC base units. Returns
  `{ proposalId, transactionHash, indexed }` after a successful chain receipt.
  `indexed: false` means the financial transaction succeeded and projection
  refresh is pending; it is not a failed purchase submission.
- GET `/trips/:tripId/proposals/:proposalId/ticket`: authenticated Ticket for a
  participant, only after fulfillment. The API verifies the exact raw ticket
  payload hash, vault, proposal, holder set and URL protocol before returning it.

The internal agent port is `ProposalService.submitProposal({ tripId, quote,
shares })`, with bigint share amounts. It returns proposalId and transactionHash.
The quote must retain all SignedQuote fields throughout the agent turn.

Submission intent is durable and keyed by the canonical signed quote digest.
Identical retries return the known receipt; ambiguous RPC failures never trigger
another broadcast of that quote. Once the indexer sees its Proposed event, a
retry can recover the actual proposal ID. A quote cannot be reused with different
participants or amounts. All proposer transactions share a serialized queue.

## Trip creation and invitations (B3)

The API never impersonates a member wallet. Creation and joining return a
WalletTransaction containing chainId, from, to, data, zero native value and Arc
gas-fee quantities. The connected wallet must match `from` and sign/send it.

- GET `/trips`: authenticated `{ trips }` containing only the member's trips.
- POST `/trips` with `{ name, endsAt }`: returns `{ creationId, expiresAt,
  transaction }` for a creator-only initial member list.
- POST `/trips/confirm` with `{ creationId, transactionHash }`: verifies the
  factory receipt/creator/end time and returns tripId, vaultAddress and indexed.
- GET `/trips/:tripId`: current authenticated member trip state.
- PATCH `/trips/:tripId` with `{ name }`: creator-only trip rename.
- POST `/trips/:tripId/members/me` with `{ displayName }`: updates only the
  signed-in member's untrusted display label, not their identity or money.

Invitations preserve the contract's existing creator-signature authority:

1. Creator POSTs `/trips/:tripId/invites` with `{}` or `{ expiresAt }` to get a
   single-use link. Only a hash of its opaque token is stored.
2. Recipient signs in and POSTs `/invites/:token/claim`. The link is atomically
   bound to that wallet and returns an inviteId. Another wallet cannot reuse it.
3. Creator GETs `/trips/:tripId/invites`, then GETs
   `/trips/:tripId/invites/:inviteId/authorization` for the exact EIP-712 Invite
   typed data. Sign its deadline as a uint256 (the JSON response uses a string).
4. Creator POSTs `{ signature }` to that authorization endpoint.
5. Recipient polls GET `/invites/:inviteId`. Once authorized, it returns the
   wallet-signed join transaction. The API cannot sign membership on its own.
6. Recipient POSTs `/invites/:inviteId/confirm` with `{ transactionHash }` after
   mining. Lost confirmation responses can recover from actual onchain membership.

The creator must be online to authorize a newly claimed wallet. Signed grants
cannot be revoked by merely changing backend metadata; the contract expiry is
the authority. Joining never changes an existing purchase's participants.
World linking should follow joining and precede the first deposit in onboarding.

## Chat and resumable streams (B6)

- GET `/trips/:tripId/chat?limit=40`: authenticated recent messages, oldest first.
- POST `/trips/:tripId/chat`: `{ requestId, text }`; requestId is a client UUID
  generated once for a send attempt. The sender always comes from the session,
  never the request body. The response contains requestId, status, errorCode and
  reply (memberMessage/agentMessage when complete).
- GET `/trips/:tripId/itinerary`: group itinerary with ticket bearer links
  redacted. Fetch each participant's paid ticket through the A9 ticket endpoint.
- GET `/trips/:tripId/stream`: credentialed SSE with durable decimal event IDs.

A duplicate chat request with the same trip/requestId/text returns the stored
reply, or HTTP 202 while processing, without invoking the model or proposer
again. Another member cannot reuse that request ID. On restart, unfinished
turns become interrupted rather than automatically re-running a purchase-capable
model turn. A failed first attempt may return a typed error; retrying its same
requestId reports its recorded status instead of duplicating the turn.

Chat messages include optional clientRequestId for matching optimistic UI rows.
Scope private query caches/cursors by the signed-in wallet and trip, and clear
them on logout or wallet change. Member intake and planning are serialized per
trip; unrelated trips may plan concurrently. Runtime agent ports are bound to
the particular trip, preserving merchant/vault/chain quote binding.

The get_quote tool requires an explicit startsAt. Merchant responses cannot
silently change it; the agent asks the group if the intended time is unclear.
The static system prompt has a cache boundary before trusted current UTC context.

For streams, pass Last-Event-ID on reconnect or `?after=<id>` when opening a new
EventSource instance. Register listeners for the shared TripEvent type names
(chat.message, proposal.created, proposal.updated, balances.updated and
itinerary.updated). Each frame's JSON data is the shared TripEvent.
The server subscribes before its initial replay, queries persisted rows in ID
order after each notification, and uses heartbeat comments. Session validity is
rechecked during delivery/heartbeats and listeners are removed on disconnect.
Message/itinerary writes and their outbox records commit atomically; notifications
are wakeups, so out-of-order notifications cannot skip a persisted event.

Ticket bearer URLs are never put in group itinerary event payloads. They remain
in durable booking storage and are disclosed through participant-authorized,
hash-verified ticket retrieval only. The backend returns Cache-Control: no-store
for private data. Real agent replies require ANTHROPIC_API_KEY; search additionally
requires TAVILY_API_KEY. No model or verification mock is enabled by env flags.

## Money snapshots, history and wallet actions (B8 backend)

- GET `/trips/:tripId/money`: member balances plus the caller's cumulative
  deposited/spent/locked/available/withdrawn amounts, wallet ERC20 balance,
  settlement flag and indexed block. Onchain reads use that same indexed block.
- GET `/trips/:tripId/history?limit=20&before=<block>:<logIndex>`: newest-first
  immutable vault events with actual transaction hashes and a nextCursor.
  Ordering uses numeric block height and log index rather than decimal text order.
- POST `/trips/:tripId/actions`: prepares unsigned member wallet transactions
  for deposit, withdraw, policy, reject, refund or settle. No member action is
  sent by the backend. Deposits include an exact-amount USDC approval when needed.

Amounts are decimal strings of six-decimal base units. Action bodies are strict
and contain no selectable sender, recipient or spender. Examples:

```json
{ "action": "deposit", "amount": "10000000" }
```

```json
{ "action": "policy", "autoApproveMax": "10000000", "totalCap": "50000000" }
```

The response is `{ action, transactions }`. Sign/send each transaction in order
with the wallet matching `from`, wait for its receipt, and refresh trip state.
The current wallet still needs USDC for Arc gas; native gas fees use 18-decimal
quantities and never enter vault principal accounting. Above-limit approvals
continue to use the fresh World attestation flow, not this preparation endpoint.
