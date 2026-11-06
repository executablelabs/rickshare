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
| `apps/merchants` | Hono, Bun | Mock activity operators: signed quotes, tickets, delivery, optional x402 checkout |
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
- merchants: `PORT`, `ARC_RPC_URL`, `TRIP_FACTORY_ADDRESS`, `MERCHANT_1_PRIVATE_KEY`, `MERCHANT_2_PRIVATE_KEY`, `MERCHANT_3_PRIVATE_KEY`, `PUBLIC_URL`, `X402_ENABLED`, `X402_NETWORK`, `X402_FACILITATOR_URL`
- web: `VITE_API_URL`, `VITE_ARC_RPC_URL`, `VITE_SEPOLIA_RPC_URL`, `VITE_PRIVY_APP_ID` (everything prefixed `VITE_` is public)
- contracts: `ARC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `AGENT_ADDRESS`, `VERIFIER_ADDRESS`

### App-funded trip creation

Set `GAS_SPONSOR_PRIVATE_KEY` in the API environment to a dedicated app wallet funded with Arc testnet USDC from [Circle's faucet](https://faucet.circle.com). Restart the API after configuration. Trip creation requires fee coverage and returns a retryable service error if coverage is unavailable.

Before returning the creation transaction, the API estimates its gas with a simulation-only funded balance, adds a 25% gas buffer, and transfers the resulting native USDC allowance to the signed-in user. The user confirms their own factory transaction, preserving trip ownership. Native gas accounting uses 18 decimals; trip deposits still use the 6-decimal ERC-20 interface.

`GAS_SPONSOR_MAX_FEE_USDC` caps each allowance (default `1` USDC), and `GAS_SPONSOR_DAILY_BUDGET_USDC` caps daily allowances (default `10` USDC, UTC). Each wallet can receive five creation allowances per UTC day. The sponsor also pays the funding transfer's network fee, additional to these allowance budgets. Allowances are ordinary wallet funds and remain with the user if creation is cancelled.

Retries with the same creator, name, dates and location reuse unfinished creation requests for up to one hour. Signed funding transfers are saved before broadcast, so retries and API restarts reuse the same transfer. New requests recover outstanding funding first to serialize the sponsor's nonce. The saved creation transaction retains its funded fee settings on retry.

For Railway, keep the key in the API service's environment variables and deploy this implementation, its runtime wiring and its migration together. A configured key alone does not activate gas funding in older API releases. Verify an authenticated empty wallet receives its allowance before opening transaction confirmation. Fee coverage applies to trip creation; other wallet actions retain their existing fee flows.

### Optional x402 merchant checkout

Set `X402_ENABLED=true` in the merchant service to advertise x402 v2 `exact` checkout for new quotes. The initial payment network is Base Sepolia (`eip155:84532`), using USDC and the configured facilitator. The activity price and recipient come from the signed merchant quote. Verified, successfully settled payments return a booking ticket and a `PAYMENT-RESPONSE` receipt.

The context-aware agent discovers activities through search, checks the booking catalog, and negotiates x402 payment requirements without signing a payment. It reports the actual terms and `payment_adapter_required`: group-funded approval/payment still needs the Arc-vault-to-x402 adapter. These drafts do not create approval cards or confirmed bookings. Setup, endpoints and remaining integration work: [docs/X402.md](docs/X402.md).

## Deployments (Arc testnet, chain 5042002)
Web deployment: [rickshare.xyz](https://rickshare.xyz). See [Railway and local HTTPS setup](docs/DEPLOYMENT.md).

| Contract | Address |
|---|---|
| TripFactory | [`0x127a05d19df8201654128546f66a3f8d3eec84f3`](https://explorer.testnet.arc.io/address/0x127a05d19df8201654128546f66a3f8d3eec84f3) |
| Demo TripVault | |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` |

Factory deployment confirmed at block `70991387`. The [deployment record](packages/shared/src/deployments/arcTestnet.json) contains the transaction hash and configured public role addresses.

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
