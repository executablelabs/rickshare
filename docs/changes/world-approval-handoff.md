# World approval handoff recovery

## Summary

Resume the exact saved activity after the World callback, including a same-tab return or reload. Avoid showing another generic connect card once authentication has returned. The required action-bound proof opens directly when still pending, then a verified attestation continues to the member's wallet confirmation.

## Changes

- Authenticated request status includes its kind and purchase target. Callback URLs retain the proposal ID so only that proposal resumes.
- Awaiting-proof recovery retains its URL; terminal outcomes and completed wallet approval clear it. Link-only identity verification is not mistaken for purchase approval.
- The human approval sheet removes the artificial AI-message adapter, opens official IDKit once for a valid challenge, and submits through the typed existing proof endpoint. Expired or invalid-origin requests show a visible reason and actionable restart/cancel controls.
- Before requesting a wallet transaction, refresh the proposal and validate the attestation against the member, amount, chain, vault, proposal and cutoff. Already-approved/automatic/locked/fulfilled states are reconciled rather than sent again.
- Browser-local attempt and pending markers prevent replay after a reload or uncertain wallet result. Definitive user rejection, revert or insufficient-funds failure clears pending state; an unknown outcome stays pending for reconciliation.
- Preserve separate progress for World authentication, activity proof, wallet confirmation, waiting for participants, and actual escrow locking. Deposited available funds are already in the vault; World verification alone does not lock a proposal's shares.
- Callback OAuth errors retain whitelisted diagnostic codes rather than all appearing as user cancellation.

## Verification

- Targeted API/web TypeScript and Biome checks passed; production Vite build passed.
- Repository-wide lint and typecheck passed with the pinned Foundry toolchain. Existing CI fixtures now follow automatic IDKit entry, the exact callback target, additive status metadata and the more specific failure/progress messages. Existing proof, cancellation, attestation and calldata assertions remain.
- Browser layout inspection at 390px and 1280px showed enabled restart/cancel recovery controls and no horizontal overflow. Screenshots cover an expired local layout fixture, not a completed live World proof.
- Read-only production inspection showed proposal 6 pending with two waiting 4-USDC shares, both approval-expiry values zero, and 20 USDC available / zero locked. No diagnostic transfer, approval, attestation or human proof was initiated.
- No local test suites run, following owner instruction. Full human verification and wallet completion still require the user's live attempt.

## Files

- `apps/api/src/modules/approvals/routes.ts`: redirect to the exact purchase after authentication.
- `apps/api/src/modules/approvals/service.ts`: additive status metadata and stable OAuth failure codes.
- `apps/web/src/lib/world.ts`: validate metadata and submit proofs to the existing endpoint.
- `apps/web/src/components/plan/HumanApprovalSheet.tsx`: direct IDKit entry and visible recovery controls.
- `apps/web/src/components/plan/ShareActions.tsx`: callback recovery, wallet continuation and submission guards.
- Existing approval and plan test fixtures: align expectations with the changed interaction and response contract; retain security and transaction assertions.

## Workflow exceptions and follow-ups

The owner requested no local test suites and authorized release merging/deployment. Local verification therefore uses typechecks, formatting, build and read-only inspection; GitHub CI remains enabled. Capture live completion evidence during the owner's next fresh Chrome attempt. Backend metadata, proof entry and callback continuation are one coordinated handoff fix, with commits split by responsibility.

## Interfaces and risk

Additive request-status metadata and callback query target. No contract, database migration, proof requirement, signature check, or environment change. Local browser guards cannot coordinate every cross-device attempt; the contract nonce and approval checks remain authoritative. Unknown outcomes deliberately remain fail-closed.
