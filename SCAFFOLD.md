# SCAFFOLD.md

One-time scaffold of the Kitty monorepo. Read `AGENTS.md` first; its commit and PR rules apply.

Goal: a wired, empty repo where `bun install && bun run check && bun run dev` work, CI is green, and both tracks can start without touching each other's folders. Do not implement features. Each app gets a health check and one real test. Exception: `packages/shared` v0 schemas are written here because both tracks build against them.

## 0. Preconditions
- Bun (latest stable), Foundry (`foundryup`), Git, GitHub CLI authenticated (`gh auth status`).
- Repo cloned. If `main` is empty, ask the human to push a first commit before branching.
- `git switch -c chore/S0-scaffold`

## 1. Target layout
```
.
├─ apps/
│  ├─ api/          Hono on Bun, port 8787
│  ├─ merchants/    Hono on Bun, port 8790
│  └─ web/          React + Vite + TS, port 5173
├─ packages/
│  ├─ contracts/    Foundry
│  └─ shared/       @kitty/shared: schemas, chains, ABIs, deployments
├─ docs/
│  ├─ DESIGN.md
│  └─ changes/
├─ .github/
│  ├─ workflows/ci.yml
│  └─ pull_request_template.md
├─ AGENTS.md  WORKPLAN.md  README.md  SCAFFOLD.md
├─ biome.json  tsconfig.base.json  package.json
```

## 2. Steps (one commit per step, messages given)

### Step 1: `chore(repo): add bun workspace root`
`package.json`:
```json
{
  "name": "kitty",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun --filter './apps/*' dev",
    "lint": "biome ci .",
    "fmt": "biome format --write .",
    "typecheck": "bun --filter './packages/*' --filter './apps/*' typecheck",
    "test": "bun --filter './packages/*' --filter './apps/*' test",
    "abi": "bun --filter @kitty/shared abi",
    "check": "bun run lint && bun run typecheck && bun run test"
  }
}
```
Verify the filters exclude the root package so scripts do not recurse. Add `.gitignore` (node_modules, dist, .env, *.sqlite, packages/contracts/out, packages/contracts/cache, packages/contracts/broadcast) and `.editorconfig`.

### Step 2: `chore(repo): add biome and base tsconfig`
- `bunx @biomejs/biome init`; set 2-space indent, line width 100, recommended rules, and ignore `out`, `cache`, `dist`, generated ABI files and `routeTree.gen.ts`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`, `target: "ES2022"`, `skipLibCheck`.

### Step 3: `feat(shared): add v0 schemas and chain config`
Package `@kitty/shared` with scripts `typecheck` (`tsc --noEmit`), `test` (`bun test`), `abi` (`wagmi generate`). Dependencies: `zod`, `viem`; dev: `@wagmi/cli`.

`src/chains.ts`: export `arcTestnet`. Use it from `viem/chains` if present; otherwise `defineChain` with id `5042002`, native currency USDC with 18 decimals, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`. Also export `ARC_USDC = "0x3600000000000000000000000000000000000000"` and `USDC_DECIMALS = 6`.

`src/schemas.ts`:
```ts
import { z } from "zod";

export const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const Hex = z.string().regex(/^0x[a-fA-F0-9]*$/);
export const UsdcAmount = z.string().regex(/^\d+$/); // base units, 6 decimals
export const IsoDate = z.string().datetime();

export const Policy = z.object({ autoApproveMax: UsdcAmount, totalCap: UsdcAmount });

export const Member = z.object({
  address: Address,
  displayName: z.string().min(1).max(32),
  ensName: z.string().nullable(),
  worldLinked: z.boolean(),
  policy: Policy,
  deposited: UsdcAmount,
  spent: UsdcAmount,
  locked: UsdcAmount,
  available: UsdcAmount,
});

export const Trip = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  ensName: z.string().nullable(),
  vaultAddress: Address,
  endsAt: IsoDate,
  members: z.array(Member),
});

export const ProposalStatus = z.enum(["pending", "locked", "fulfilled", "refunded", "rejected"]);
export const ShareState = z.enum(["auto", "approved", "waiting", "rejected"]);

export const Proposal = z.object({
  id: z.string(),
  tripId: z.string(),
  merchant: Address,
  merchantName: z.string(),
  title: z.string(),
  location: z.string(),
  startsAt: IsoDate,
  total: UsdcAmount,
  shares: z.array(z.object({ member: Address, amount: UsdcAmount, state: ShareState })),
  status: ProposalStatus,
  deadline: IsoDate,
  ticketHash: Hex.nullable(),
  txHash: Hex,
});

export const Quote = z.object({
  quoteId: z.string(),
  merchant: Address,
  itemId: z.string(),
  title: z.string(),
  unitPrice: UsdcAmount,
  quantity: z.number().int().positive(),
  total: UsdcAmount,
  startsAt: IsoDate,
  expiresAt: IsoDate,
  quoteHash: Hex,
  signature: Hex,
});

export const Ticket = z.object({
  proposalId: z.string(),
  code: z.string(),
  url: z.string().url(),
  holders: z.array(Address),
});

export const ItineraryItem = z.object({
  id: z.string(),
  startsAt: IsoDate,
  title: z.string(),
  location: z.string(),
  proposalId: z.string().nullable(),
  ticketUrls: z.array(z.string().url()),
});

export const ChatMessage = z.object({
  id: z.string(),
  tripId: z.string(),
  role: z.enum(["member", "agent"]),
  author: Address.nullable(),
  text: z.string(),
  proposalIds: z.array(z.string()),
  createdAt: IsoDate,
});

export const TripEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal.created"), proposal: Proposal }),
  z.object({ type: z.literal("proposal.updated"), proposal: Proposal }),
  z.object({ type: z.literal("chat.message"), message: ChatMessage }),
  z.object({ type: z.literal("balances.updated"), members: z.array(Member) }),
  z.object({ type: z.literal("itinerary.updated"), items: z.array(ItineraryItem) }),
]);

export type Policy = z.infer<typeof Policy>;
export type Member = z.infer<typeof Member>;
export type Trip = z.infer<typeof Trip>;
export type Proposal = z.infer<typeof Proposal>;
export type Quote = z.infer<typeof Quote>;
export type Ticket = z.infer<typeof Ticket>;
export type ItineraryItem = z.infer<typeof ItineraryItem>;
export type ChatMessage = z.infer<typeof ChatMessage>;
export type TripEvent = z.infer<typeof TripEvent>;
```
Add `src/money.ts` with `parseUsdc(string): bigint` and `formatUsdc(bigint): string`, with tests for rounding and invalid input (`src/money.test.ts`). Add `src/deployments/arcTestnet.json` as `{}` and `wagmi.config.ts` using the Foundry plugin pointed at `../contracts`, writing to `src/abi.ts`.

### Step 4: `chore(contracts): init foundry project`
- `forge init packages/contracts --no-git` (if the flag is unavailable, init in a temp directory and move the files). Remove the Counter example.
- `forge install OpenZeppelin/openzeppelin-contracts`; add the remapping `@openzeppelin/=lib/openzeppelin-contracts/`.
- `foundry.toml`: `solc = "0.8.24"`, optimizer on (200 runs), `[rpc_endpoints] arc = "${ARC_RPC_URL}"`.
- `test/mocks/MockUSDC.sol` (ERC20, 6 decimals, open `mint`) and `test/MockUSDC.t.sol` checking decimals and mint. Track A uses this mock from A1.
- `package.json` with `typecheck` = `forge build`, `test` = `forge fmt --check && forge test`.

### Step 5: `chore(api): add hono api skeleton`
- Dependencies: `hono`, `zod`, `@hono/zod-validator`, `drizzle-orm`, `viem`, `jose`, `@kitty/shared` (workspace). Dev: `drizzle-kit`, `@types/bun`, `typescript`.
- `src/index.ts`: `export default { port: config.PORT, fetch: app.fetch }`.
- `src/app.ts`: Hono app with `GET /health`; export `type AppType = typeof app`.
- `src/config.ts`: zod-parsed env (all keys from `.env.example`, optional where a later task adds them).
- `src/lib/logger.ts`, `src/lib/errors.ts` (AppError with `code` and `status`, one `onError` handler).
- `src/db/client.ts` (`bun:sqlite` + drizzle), `src/db/schema.ts` (empty export), `drizzle.config.ts`.
- Module folders with `.gitkeep`: `chain auth indexer approvals proposals trips agent chat ens`.
- `src/app.test.ts`: `/health` returns 200.
- Scripts: `dev` (`bun --watch src/index.ts`), `typecheck`, `test`.

### Step 6: `chore(merchants): add merchants skeleton`
- Hono on port 8790 with `/health` and `GET /catalog` from `src/catalog.json`: three merchants (Elephanta Caves ferry and guided walk; tandem paragliding in Arambol, Goa; Ajanta and Ellora day tour), each with items priced in USDC base units.
- One test for `/catalog` validation. Same scripts as api.

### Step 7: `chore(web): add vite react app`
- `bun create vite apps/web --template react-ts`; remove the demo counter, logos and `App.css`.
- Tailwind v4 via `@tailwindcss/vite`. Create `src/styles/tokens.css` from `docs/DESIGN.md` (colors, radii, type scale) and expose them through `@theme`.
- Fonts: `@fontsource-variable/geist` and `@fontsource-variable/bricolage-grotesque` (if a package name differs, find the Fontsource equivalent).
- TanStack Router (file-based, `@tanstack/router-plugin/vite`) with routes: `/`, `/trips/$tripId/plan`, `/trips/$tripId/itinerary`, `/trips/$tripId/money`, `/dev/ui`. Each route renders only its heading for now.
- TanStack Query provider. `src/lib/api.ts`: `hc<AppType>(import.meta.env.VITE_API_URL)` with a type-only import from the api workspace.
- Vitest + Testing Library + happy-dom, with one test that the root route renders.
- Do not install wallet libraries; B2 does that.
- Scripts: `dev`, `build`, `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`).

### Step 8: `ci: add check workflow`
`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: oven-sh/setup-bun@v2
      - uses: foundry-rs/foundry-toolchain@v1
      - run: bun install --frozen-lockfile
      - run: bun run check
```

### Step 9: `docs(repo): add pr template and env examples`
`.github/pull_request_template.md`:
```markdown
## What
## Why
## How it was tested
## Screenshots (UI only, 390px)
## Interfaces touched
## Env vars added or changed
## Risk and rollback
## Task
```
Add `.env.example` files for `apps/api`, `apps/merchants`, `apps/web` and `packages/contracts` with the keys listed in README "Environment". Values empty, one comment line per key.

### Step 10: `docs(repo): add agent, plan, design and readme docs`
Commit `AGENTS.md`, `WORKPLAN.md`, `docs/DESIGN.md`, `README.md` and this file exactly as the humans provided them. Create `docs/changes/.gitkeep`.

## 3. Verify, then open the PR
```bash
bun install
bun run check          # must pass
bun run dev            # web on 5173, api on 8787, merchants on 8790; /health returns 200
```
Add `docs/changes/S0.md`, then:
```bash
git push -u origin HEAD
gh pr create --base main --title "chore(repo): scaffold monorepo [S0]" --body-file <filled template>
```
Stop after opening the PR. Do not start A1 until a human merges S0.