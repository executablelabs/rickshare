# S0 development setup

Rickshare uses the `kitty` workspace name and `@kitty/*` package names specified in
SCAFFOLD.md. This scaffold supplies infrastructure and shared v0 interfaces; the
trip, wallet, agent and payment features are subsequent WORKPLAN tasks.

## Tools and installation

- Bun 1.4.4
- Foundry 1.5.1 (`forge` on PATH, for example via `foundryup -i v1.5.1`)
- Git and GitHub CLI (authenticated as `gitaugakwa` for this repository)
- Node.js 22.12+ for Vite/Vitest tooling (CI uses the runner's Node installation)

From a checkout or worktree:

```sh
git submodule update --init --recursive
bun install --frozen-lockfile
bun run check
bun run dev
```

If Foundry is managed by mise, `mise exec foundry@1.5.1 -- bun run check` supplies
the same compiler/test toolchain without changing global defaults.

The app skeletons run without credentials. Copy each `.env.example` to `.env`
when configuring integrations. Blank values use documented local defaults or are
left unset. Integration tasks must require their credentials when implemented.
All `VITE_*` values are public browser configuration, never secrets.

## Local endpoints

| Service          | Address                       |
| ---------------- | ----------------------------- |
| Web              | http://localhost:5173         |
| API health       | http://localhost:8787/health  |
| Merchants health | http://localhost:8790/health  |
| Mock catalog     | http://localhost:8790/catalog |

The web also has heading-only routes at `/trips/:tripId/plan`,
`/trips/:tripId/itinerary`, `/trips/:tripId/money`, and `/dev/ui`.
The mock catalog is intentionally static and does not contain deployed merchant
addresses. A10 supplies actual signing identities and quote/delivery behavior.

## Workspace commands

- `bun run check`: Biome, workspace typechecks, Bun/Vitest/Foundry tests.
- `bun run dev`: runs only the three app workspaces in parallel; root scripts
  cannot recurse. Parallel mode prevents the web's type-only API dependency from
  waiting for the long-running API process to exit.
- `bun run --filter @kitty/web build`: typecheck and production web build.
- `bun run abi`: Foundry build and ABI generation into `packages/shared/src/abi.ts`.

Route-tree and ABI files are generated; regenerate them through the Vite router
plugin and `bun run abi`, respectively. The initial ABI includes only OpenZeppelin
ERC20; application contracts are introduced by A1–A5. Deployment addresses stay empty
until a real deployment exists.

`parseUsdc` accepts unsigned decimal strings and rounds half up to six decimal
places. `formatUsdc` returns exactly six decimal places. Both avoid JS floating
point. Arc's native gas currency uses 18 decimals; these utilities and
`ARC_USDC` concern the six-decimal ERC-20 interface only.

The supplied README describes the target product. Its demo seed command,
deployment links and integration walkthroughs will be supplied by later tasks.

Bun watches each backend app's directory. Restart the API and merchant processes
after changing shared package source files.
