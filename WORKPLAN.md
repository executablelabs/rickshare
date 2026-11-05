# WORKPLAN.md

Task ids are branch and PR ids. Humans edit this file; agents only read it. Status lives in GitHub PRs, not here.

Interface first: S0 (scaffold) defines `packages/shared` v0. Until Track A ships real endpoints, Track B builds against those schemas with test fixtures, which are removed before the demo.

## Track S: setup (teammate's agent, first)
- **S0 scaffold**: follow `SCAFFOLD.md`. Done when CI is green on main.

## Track A: money and trust (teammate)

| Id | Task | Depends | Acceptance |
|---|---|---|---|
| A1 | contracts: TripVault core: init with members, agent, verifier, merchant allowlist, end time; `deposit`; `setPolicy`; per-member `deposited/spent/locked/available` views | S0 | Tests for accounting, non-member deposit reverts, policy bounds |
| A2 | contracts: `propose` (agent only, allowlisted merchant, participants are members, shares sum to total, deadline in future); per-share auto-approve within the member's own `autoApproveMax` and `totalCap`; `reject` by any participant | A1 | A test for every revert; auto-approve covers mixed proposals where some shares auto-approve and some wait |
| A3 | contracts: `approve(id, attestation)`: caller is a participant, EIP-712 attestation from the verifier, unexpired, bound to member and proposal; lock shares when all approved | A2 | Wrong signer, expired, non-participant, double approve, cross-vault replay all revert |
| A4 | contracts: `fulfill` (proposal's merchant only, with ticketHash), `refund` after deadline, `settle` after trip end, `withdraw` | A3 | Fuzz/invariant: vault USDC balance equals the sum of members' available + locked; non-participants never change on a proposal |
| A5 | contracts: TripFactory, deploy script for Arc testnet, ABI generation into `packages/shared`, `deployments/arcTestnet.json` | A4 | `bun run abi` works; factory deployed; address recorded |
| A6 | api: config, Arc chain clients, SIWE session auth (viem siwe utilities), session middleware | S0 | Login, logout and session tests |
| A7 | api: indexer: watch vault events, write proposals, approvals and balances to SQLite, publish `TripEvent`s on an internal bus | A5, A6 | Replays from a start block after restart without duplicates |
| A8 | api: World ID: link member (store `sub` per member address), approval start and callback using step-up auth, ID-token validation, EIP-712 attestation signer | A3, A6 | Success, cancelled, expired and wrong-`sub` paths tested; secrets never reach the client |
| A9 | api: proposals service `submitProposal(quote, participants, shares)`: verifies merchant quote signature and expiry, validates shares, submits with the agent key | A5, A10 | Rejects unknown merchants, expired quotes, bad sums |
| A10 | merchants: catalog, signed quotes, watcher that issues a ticket on `Locked` and calls `fulfill`, ticket page with QR | A5 | End to end on a local anvil fork |
| A11 | scripts: `bun run demo:seed`: creates a trip, funds three member wallets, deposits, sets policies | A5 | One command gives a demo-ready trip |
| A12 | stretch: one cross-chain USDC deposit from Base Sepolia via CCTP | A11 | Only if A1–A11 merged |

## Track B: experience and intelligence (you)

| Id | Task | Depends | Acceptance |
|---|---|---|---|
| B1 | web: tokens, fonts, app shell, bottom nav and desktop rail, primitives (Button, Sheet, Amount, Avatar, AvatarStack, Chip, Field, Toast), `/dev/ui` gallery | S0 | Gallery renders all primitives at 390 and 1280; matches DESIGN.md |
| B2 | web: embedded wallet on Arc testnet, SIWE login against A6, typed API client, auth guard | B1, A6 | Fresh user gets a wallet and session with no extension installed |
| B3 | api: trips module: create trip (factory via chain module), invite links, join, list | A5, A6 | Route tests; invite tokens are single-use |
| B4 | web: create trip, invite, join (including the World link step from A8), add money (approve + deposit), My limits sheet | B2, B3, A8 | Full onboarding for three users on phones |
| B5 | api: agent module: LLM client, system prompt, tools (`search_activities`, `list_merchants`, `get_quote`, `get_trip_state`, `propose_purchase` via A9, `update_itinerary`), untrusted-content wrapping, chat persistence | S0 | Stubbed-LLM tests; injected text in a search result cannot change a payee |
| B6 | api: chat routes, SSE `/trips/:id/stream` forwarding `TripEvent`s | B5, A7 | Reconnects resume without missing events |
| B7 | web: Plan feed: chat, ProposalTicket card, Approve my share (World step-up then `approve` tx), Not for me (`reject`), stamp animation | B6, A8, A9 | Each approval state shown; declined and expired paths shown |
| B8 | web: Itinerary (by day, links to my tickets) and Money (balances per member, history, settle) | B7, A10 | Ticket links open the merchant ticket page |
| B9 | ens: parent name config; per-trip subregistry, member and agent subnames; agent granted setter role only for the `itinerary` text key; app shows names | B3 | Agent can write `itinerary` and is reverted on any other key |
| B10 | polish: empty, error and loading states; desktop two-pane; accessibility pass; reduced motion | B8 | Lighthouse mobile accessibility 95+ |

## Sync points
1. After S0: both start. B works on B1, B5 and B9 research; A on A1–A3.
2. After A5: real addresses and ABIs exist. B3 and B4 switch from fixtures to chain.
3. After A8 + A9: B7 wires the real approval flow.
4. Freeze: from 6 hours before submission, only fixes and demo polish, still via PRs.

## Demo script (both tracks build toward this)
1. Angie creates "India 26", invites Bashy and Gitau. Everyone adds money and sets limits.
2. In Plan, someone asks for things to do around Mumbai and Goa. The agent proposes the Elephanta ferry for all three and paragliding for Angie and Gitau.
3. Elephanta: all three approve. Paragliding: Bashy is not part of it, so his balance never moves.
4. The agent suggests a pricey dinner and Bashy taps Not for me. The proposal closes and nobody is charged.
5. A listing with hidden instructions tries to send funds elsewhere. The contract rejects the transaction.
6. Tickets appear in Itinerary. Money shows balances. Settle returns leftovers.