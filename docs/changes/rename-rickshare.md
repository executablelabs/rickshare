# Chore: rename the project from kitty to rickshare

## Summary

The product is called Rickshare, but the workspace, packages and docs still
used the working name "kitty". Every occurrence is renamed: package scope
`@kitty/*` to `@rickshare/*`, the root workspace `kitty` to `rickshare`, the
default database file to `rickshare.sqlite`, and "Kitty" to "Rickshare" in the
docs (including the ENS example `bashy.india26.rickshare.eth`).

## Files

- `package.json`, `apps/*/package.json`, `packages/*/package.json`, `bun.lock`:
  names.
- Source, tests and scripts across apps, packages and `scripts/`: imports from
  `@rickshare/shared` and `@rickshare/api`.
- `.github/workflows/ci.yml`: web build filter.
- `apps/api/src/config.ts`, `config.test.ts`, `.env.example`: default database
  file.
- AGENTS.md, README.md, SCAFFOLD.md, docs/SETUP.md and change records: names in
  prose and commands.

## Interfaces touched

- Package names: code importing `@kitty/shared` or `@kitty/api` must import
  `@rickshare/shared` or `@rickshare/api`. Open branches need a rebase and the
  same find-and-replace.
- Default `DATABASE_PATH` is now `rickshare.sqlite`. A local `kitty.sqlite` is
  ignored; it holds only derived state.

## Verification

- bun install --frozen-lockfile: pass.
- bun run check: pass on current main with Track A merged.
- bun run --filter @rickshare/web build: pass.
- git grep -i kitty: matches only this change record.

## Follow-ups

- After pulling: run `bun install`, and delete any stale `node_modules/@kitty`
  folders under apps/.
