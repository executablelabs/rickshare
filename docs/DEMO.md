# Demo preparation and verification

## Prepare operator-controlled test wallets

```sh
bun run demo:prepare
```

This generates distinct deployer, proposer, verifier, merchant and member keys.
Private keys go only to ignored package env files and scripts/demo.env. The
command refuses to overwrite existing env files. Public funding addresses are
printed and saved to .local/demo-wallets.json. Existing setups can instead fill
the supplied env examples and scripts/demo.env.example.

No World identity is fabricated or pre-linked. Configure the registered World
application and complete real identity linking before live manual approvals.

## Seed Arc testnet

1. Fund the generated deployer with testnet USDC at https://faucet.circle.com.
   The faucet requires human reCAPTCHA interaction. Native Arc gas and the
   six-decimal ERC20 interface represent the same underlying USDC balance.
2. `bun run contracts:deploy` deploys the factory and writes a public deployment
   record only after a successful receipt. The configured RPC must be Arc
   testnet, chain 5042002; mainnet is rejected.
3. Run the seed command:

```sh
bun run demo:seed
```

If no factory is configured, the seed command invokes contracts:deploy first.
It validates factory roles/token, tops up three demo wallets and the transaction
signers, creates the trip, deposits for each member and sets personal policies.
All transfers are signed by the operator-controlled wallets, not relayed with an
administrator permission on other people's vault funds.

The default deposit is 100 USDC per member, plus transaction gas reserves.
DEMO_DEPOSIT_USDC can lower the seed amount to match available testnet funding;
the script prints required/available base units and stops before top-ups when
the deployer is underfunded. Mock catalog prices still apply, so choose amounts
that cover the purchases being demonstrated.

## Run the same flow on a local EVM

With Foundry on PATH, start Anvil in another terminal:

```sh
anvil --silent --host 127.0.0.1 --port 8545 --chain-id 5042002
```

Set ARC_RPC_URL in scripts/demo.env to http://127.0.0.1:8545, then:

```sh
bun run demo:seed --local
bun run --env-file .local/runtime.env dev
```

`--local` requires both a loopback URL and an Anvil client. It installs the test
ERC20 runtime at the canonical USDC address and funds local gas accounts; those
operations are never attempted against the public Arc RPC. Each local seed gets
a new run directory, preserving older local databases instead of reusing a
cursor from a reset node. Live demo databases use a stable .local/live directory.

The generated .local/runtime.env contains RPC, factory, start-block and database
overrides. It contains no private keys. The original package env files retain
their role-scoped secrets. Open the tripUrl from .local/demo-state.json.

A standard Anvil node tests ERC20 principal accounting, not Arc's native USDC gas
implementation. Actual Arc deployment remains a separate funded live check.

## Automated checks

`bun run check` includes local-chain integration tests. They deploy real
contracts on an ephemeral Anvil node and exercise canonical quote hash parity,
automatic consent, manual attestations, paid tickets, refunds, withdrawals and
indexer replay. Unit tests separately validate real RSA-signed OIDC tokens.
The integration test's injected human provider is test-only; production uses
World discovery/JWKS validation and has no bypass flag.

Browser ticket captures from the CLI/server smoke pass:

- [390px](changes/A10-ticket-390.png)
- [1280px](changes/A10-ticket-1280.png)
