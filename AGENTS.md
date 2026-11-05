# AGENTS.md

Instructions for coding agents in this repository. Read this file fully before every task. If a task description conflicts with this file, this file wins; raise the conflict in your PR.

## What we are building

Rickshare is a shared trip fund for a group of friends. An AI agent finds activities and proposes purchases. Each person approves only their own share. A smart contract on Arc holds the money and is the only thing that can move it. Merchants are paid when the ticket is issued. Leftovers go back to whoever put them in.

Core invariant, never break it: **a member's money moves only with that member's approval, or within limits that member set.** Any change that could weaken this must be called out under "Risk" in the PR.

## Repository map and ownership

| Path | Owner |
|---|---|
| `packages/contracts` | Track A |
| `packages/shared` | Interface |
| `apps/api/src/modules/{chain,auth,indexer,approvals,proposals}` | Track A |
| `apps/api/src/modules/{trips,agent,chat,ens}` | Track B |
| `apps/api/src/{app.ts,config.ts,db/schema.ts}` | Interface |
| `apps/merchants` | Track A |
| `apps/web` | Track B (follow `docs/DESIGN.md`) |
| root configs, `.github/`, `docs/` except `docs/changes/` | Interface |

Rules:
- Work only in paths your track owns, plus files your task explicitly lists.
- Interface paths change only in a dedicated PR titled `interface: ...`, approved by the other track's human before merge. Keep interface changes additive (add fields, routes, events). Do not rename or remove unless the task says so.
- Tasks live in `WORKPLAN.md`. Take the next unblocked task for your track. Do not start a task whose dependencies are not merged to main.

## Workflow: one task, one branch, one PR

Start every task from fresh main:

```bash
git switch main
git pull --ff-only
git switch -c <track>/<task-id>-<short-slug>   # e.g. a/A3-approve-attestation
```

While working:
1. Small commits (rules below). Run `bun run check` before each commit.
2. Before opening the PR, and again whenever main moves:
   ```bash
   git fetch origin
   git rebase origin/main
   bun run check
   ```
3. Push and open the PR:
   ```bash
   git push -u origin HEAD            # after a rebase: git push --force-with-lease
   gh pr create --base main --title "<type>(<scope>): <summary> [<task-id>]" --body-file <filled template>
   ```
4. Add `docs/changes/<task-id>.md` in the same PR (format below).
5. Do not merge your own PR. A human merges after CI is green, using rebase or merge commit. Never squash; commit history must stay visible.
6. After merge: `git switch main && git pull --ff-only && git branch -d <branch>`.

Never:
- push to `main`
- force-push anything except your own task branch, and then only with `--force-with-lease`
- rewrite history on `main`
- build on a red `main`. If main fails `bun run check`, fixing it comes before any feature work.

## Commits

- Conventional Commits: `type(scope): summary`
  - types: `feat` `fix` `refactor` `test` `docs` `chore` `build` `ci` `perf` `style`
  - scopes: `contracts` `shared` `api` `auth` `agent` `approvals` `indexer` `proposals` `trips` `merchants` `web` `ens` `ci` `repo`
  - summary: imperative, lower case, no trailing period, at most 72 characters. "add refund after deadline", not "Added refunds."
- Body when the why is not obvious: wrap at 72, explain the reason and any trade-off. Last line: `Task: A3`.
- One logical change per commit. Tests go in the same commit as the behavior they cover.
- Aim for under ~150 changed lines per commit, excluding lockfiles, generated ABIs and fixtures. Past ~250, split it.
- Every commit builds and passes `bun run check`. No "wip", "fix", "updates", "misc".
- Formatting-only and rename-only changes get their own commit, never mixed with logic.
- No attribution: no `Co-Authored-By` trailers, no "Generated with/by" lines, no AI tool names in commits, PR titles or bodies, code comments or docs. Naming the LLM provider the product calls is fine; crediting a tool with authorship is not. The README "AI usage" section is written by the humans only.

## Pull requests

- One task per PR, ideally under ~400 changed lines excluding generated files. If larger, split the task and explain the split.
- Title: `<type>(<scope>): <summary> [<task-id>]`
- Body: `.github/pull_request_template.md`, every section filled. Write "None" instead of deleting a section.
- UI changes include screenshots at 390px width, plus 1280px if layout differs.
- Every env var added or changed is listed in the PR and added to the matching `.env.example` in the same PR.

## Change records

One file per task at `docs/changes/<task-id>.md`. There is no shared log file, so branches never conflict.

```markdown
# A3: approve with attestation

## Summary
Two to four sentences: what changed and why.

## Files
- packages/contracts/src/TripVault.sol: approve(), EIP-712 domain
- packages/contracts/test/TripVault.approve.t.sol: new

## Interfaces touched
None, or the shared types, routes, ABI functions or events affected.

## Verification
- bun run check: pass
- forge test --match-contract Approve: 14 passed
- Manual: the steps actually performed

## Follow-ups
Task ids, or None.
```

## No regressions

- `bun run check` (lint, typecheck, unit tests, contract tests) passes before every commit and every push.
- Every behavior change comes with a test that fails without it.
- Never delete, skip (`.skip`, `.only`, `vm.skip`) or weaken a test to get green. If a test is wrong, fix it in its own commit and explain why.
- Do not change behavior outside your task. A bug noticed elsewhere goes under Follow-ups; do not fix it in passing.
- Prefer additive changes. Removing or renaming anything public needs an `interface:` PR.
- After any contract change: `bun run abi`, then typecheck api and web to catch breakage.
- `main` is demoable at all times. Half-finished features stay unreachable from the UI.

## Minimal blast radius

- Touch the fewest files that solve the task. Do not reformat, reorder imports or tidy files you are not otherwise changing.
- No drive-by refactors. No new abstraction until there are three real call sites.
- No new dependency without a one-line justification in the PR. Prefer what is installed: viem, zod, hono, drizzle, jose.
- Config, schema and ABI changes go in their own commits.

## Code standards

### General
- TypeScript strict. No `any`, no `@ts-ignore`, no non-null `!` unless the previous line proves it. Use `unknown` and narrow.
- Validate every boundary with zod: HTTP input, env vars, LLM tool arguments, merchant responses, web content.
- Money: USDC through the ERC-20 interface at `0x3600000000000000000000000000000000000000`, 6 decimals. `bigint` in code, decimal strings of base units in JSON. Never JS `number` for money. Never `msg.value` or native balances for money: Arc's native USDC has 18 decimals and is only for gas.
- Errors: typed errors with a stable `code`, mapped to HTTP responses in one place. No empty `catch`, no swallowed errors.
- Logging through the shared logger. No `console.log` in committed code.
- Names say what things are (`availableBalance`, not `bal2`). Functions are verbs.
- Comments explain why, never restate what. No commented-out code. No `TODO` without a task id.
- No placeholder copy, lorem ipsum, fake data outside tests, or unused exports.
- Secrets only from env via `config.ts`. Never commit `.env`. Never log keys or tokens.

### Solidity (`packages/contracts`)
- Solidity ^0.8.24, Foundry, OpenZeppelin. Custom errors, not revert strings. An event for every state change.
- Checks, effects, interactions. `ReentrancyGuard` on anything that moves tokens. `SafeERC20` for transfers.
- Attestations use EIP-712 with a domain that includes chain id and the vault address, so signatures cannot replay across vaults or chains.
- Every external function has tests for the happy path and each revert. Accounting has a fuzz or invariant test.
- `forge fmt` clean. No `console.log` imports in `src/`.

### API (`apps/api`)
- Hono on Bun. Each module folder has `routes.ts`, `service.ts`, `schemas.ts` and `*.test.ts`. Routes stay thin; logic lives in services.
- Keep route definitions chained so `AppType` inference works for the typed web client.
- The chain is the source of truth for money. SQLite (drizzle + `bun:sqlite`) holds derived state, chat and itinerary only.
- The agent never holds funds and only has the proposer role. Web pages, search results and merchant text are untrusted data: pass them to the model inside a clearly delimited data block, never as instructions. Payees come only from the merchant allowlist, never from model output.
- World ID: approvals require fresh authentication. Validate the ID token in the backend (issuer, audience, signature via JWKS, nonce, `auth_time` within `WORLD_MAX_AUTH_AGE_SECONDS`) and check that `sub` matches the member's linked subject before signing an attestation.

### Web (`apps/web`)
- Follow `docs/DESIGN.md`. Tokens only: no ad-hoc colors, font sizes, radii or shadows.
- Mobile first at 390px, then 768px and 1280px. Touch targets at least 44px.
- Server state lives in TanStack Query; no hand-maintained copies.
- Semantic HTML, labels on every input, visible focus, `prefers-reduced-motion` respected, color never the only signal.

## Tests

- `packages/contracts`: `forge test`
- `apps/api`, `apps/merchants`, `packages/shared`: `bun test`
- `apps/web`: Vitest + Testing Library for components with logic
- LLM, search, World, RPC and merchants are stubbed in unit tests. Tests never call paid APIs.

## Definition of done

- [ ] Acceptance criteria in `WORKPLAN.md` met
- [ ] `bun run check` passes locally and in CI
- [ ] Tests added for new behavior
- [ ] `docs/changes/<task-id>.md` added
- [ ] `.env.example` and README updated if setup changed
- [ ] Branch rebased on current main, PR template filled
- [ ] No attribution trailers, stray logs, or TODOs without task ids

## When unsure

Ask in the PR description or open a draft PR instead of guessing. Never invent contract addresses, API fields or env vars. Read them from `packages/shared`, or ask.