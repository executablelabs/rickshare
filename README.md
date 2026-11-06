# Rickshare

A shared trip fund where an AI agent plans and books, and nobody's money moves without their own yes.

Friends add money to one trip. The agent finds activities and proposes purchases, each naming who it is for. Each person approves only their share, either with a fresh World ID check or automatically within limits they set. The contract on Arc pays the merchant when the ticket is issued and returns leftovers to whoever put them in.

## How it works
1. **Create a trip.** Each member gets a name under the trip (for example `bashy.india26.rickshare.eth`) and sets personal limits.
2. **Add money.** USDC on Arc goes into the trip vault and is tracked per person.
3. **The agent proposes.** It searches, gets a signed quote from an allowlisted merchant and proposes a purchase with participants and shares.
4. **Each participant consents.** Shares within a member's own limit are approved automatically. Anything above needs a fresh World ID authentication plus a transaction from that member's wallet. Anyone can decline; non-participants are never charged.
5. **Paid on delivery.** Funds lock when everyone in the proposal agrees and go to the merchant when the ticket is issued. If no ticket arrives by the deadline, the shares are refunded.
6. **Settle.** After the trip, leftovers return to each member.

## Architecture
| Part | Stack | Role |
|---|---|---|
| `packages/contracts` | Solidity, Foundry | TripVault and TripFactory on Arc testnet |
| `apps/api` | Hono, Bun, SQLite | Agent, approvals (World ID step-up + EIP-712 attestations), indexer, trips |
| `apps/merchants` | Hono, Bun | Mock activity operators: signed quotes, tickets, delivery |
| `apps/web` | React, Vite, TypeScript | Mobile-first app |
| `packages/shared` | TypeScript, zod | Schemas, chain config, ABIs, deployments |

Identity uses ENSv2 on Ethereum Sepolia. The agent's name can edit only the trip's `itinerary` record.

Architecture diagram: `docs/architecture.png`

## Trust model
- Only the vault moves money, and it enforces each member's limits and consent per share.
- The agent key can only propose. Payees come from the merchant allowlist, so a manipulated agent cannot redirect funds.
- An approval needs both the member's wallet and an attestation that the member just authenticated with World ID. The attestation signer alone cannot approve; a stolen wallet alone cannot approve.
- Limitations: the attestation signer is run by us and could refuse to sign (liveness, not safety). Merchants are mocks; a real deployment needs merchant onboarding and dispute handling.

## Getting started
Requirements: Bun, Foundry, GitHub CLI.
```bash
bun install
cp apps/api/.env.example apps/api/.env               # fill in
cp apps/merchants/.env.example apps/merchants/.env
cp apps/web/.env.example apps/web/.env
cp packages/contracts/.env.example packages/contracts/.env
bun run check
bun run dev
```

## Scripts
| Command | Does |
|---|---|
| `bun run dev` | Runs web, api and merchants |
| `bun run check` | Lint, typecheck, unit and contract tests |
| `bun run abi` | Regenerates ABIs from contracts into `packages/shared` |
| `bun run demo:seed` | Creates a demo trip with three funded members |

## Environment
See each `.env.example`. Keys:
- api: `PORT`, `DATABASE_PATH`, `WEB_ORIGIN`, `ARC_RPC_URL`, `ARC_WS_URL`, `SEPOLIA_RPC_URL`, `TRIP_FACTORY_ADDRESS`, `AGENT_PRIVATE_KEY`, `VERIFIER_PRIVATE_KEY`, `ENS_ADMIN_PRIVATE_KEY`, `ENS_PARENT_NAME`, `WORLD_ISSUER`, `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`, `WORLD_REDIRECT_URI`, `WORLD_MAX_AUTH_AGE_SECONDS`, `ATTESTATION_TTL_SECONDS`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TAVILY_API_KEY`, `MERCHANTS_URL`, `SESSION_SECRET`
- merchants: `PORT`, `ARC_RPC_URL`, `TRIP_FACTORY_ADDRESS`, `MERCHANT_1_PRIVATE_KEY`, `MERCHANT_2_PRIVATE_KEY`, `MERCHANT_3_PRIVATE_KEY`, `PUBLIC_URL`
- web: `VITE_API_URL`, `VITE_ARC_RPC_URL`, `VITE_SEPOLIA_RPC_URL`, `VITE_PRIVY_APP_ID` (everything prefixed `VITE_` is public)
- contracts: `ARC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `AGENT_ADDRESS`, `VERIFIER_ADDRESS`

## Deployments (Arc testnet, chain 5042002)
| Contract | Address |
|---|---|
| TripFactory | |
| Demo TripVault | |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` |

## Sponsor integrations
- **World ID Agent Pass:** step-up authentication before each approval above a member's limit. Denied, cancelled and expired paths are handled. Integration notes: `docs/world-debrief.md`.
- **ENSv2:** per-trip names, member and agent subnames, agent limited to the `itinerary` record via Enhanced Access Control, names expire at trip end.
- **Arc:** USDC vault with per-share consent, escrow on delivery and pro-rata settlement. Arc Studio project: <link>.

## Contributing
See `AGENTS.md`. One task per branch and PR, small commits, `bun run check` green.

## AI usage
(Written by the team before submission: which tools were used, for what, and what was written by hand. Required by ETHGlobal rules.)

## License
MIT