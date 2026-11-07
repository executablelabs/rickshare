# Activity approval expiry and recovery

## Cause
The affected production proposals had signed quote expiries ten minutes earlier than their displayed proposal deadlines. Approval readers and the vault correctly rejected those expired quotes, but the browser knew only the later deadline and could still launch a World popup. The itinerary treated the on-chain pending status as indefinitely awaiting approvals even after expiry.

## Changes
- Newly issued merchant quotes have a 24-hour approval window, capped by the activity start (which is already validated against trip end). Existing signatures and proposal deadlines are never extended or rewritten.
- Proposal projections expose the optional `quoteExpiresAt` field from the on-chain proposal. The indexer refreshes legacy projections missing this field once, including otherwise idle vaults, while preserving cursor atomicity and paced RPC requests.
- The browser uses the earlier of quote expiry and proposal deadline. Pending expired proposals disappear from active Plan and itinerary views, including itinerary items already linked to them. Chat records, on-chain history and issued/fulfilled tickets remain intact.
- Expiry updates at its cutoff and on browser focus/visibility changes. Approval clicks and wallet submission are guarded; expired clicks do not start World, and server expiry responses refresh relevant caches.
- New active proposal cards display the actual approval cutoff. A replacement quote/proposal still requires the user's explicit planning action and fresh consent.
- World polling and resumed requests retain typed expiry/cancellation/failure errors, with a specific explanation when World never returns before the request expires. Human-approval proof errors preserve actionable messages.
- Confirmed policy updates finish when the selected member's requested limits are present in either relevant query cache; unrelated list/invite refreshes no longer cause a false limits-save warning. Confirmed wallet transactions are not resent on refresh retries.

## World environment audit
Production OIDC uses `https://auth.world.org` and the expected same-origin callback. The subsequent IDKit stage already uses `WORLD_PROOF_ENVIRONMENT=staging`. Affected requests remained pending and no callback arrived in the inspected window, so IDKit environment selection does not explain this pre-callback stall. Provider completion, browser/network redirect handling, and portal registration/account-mode settings remain candidates. No issuer, callback, environment, credential, verification requirement or freshness limit was changed.

## Interfaces touched
Additive optional `Proposal.quoteExpiresAt`; shared proposal/event JSON. No ABI, contract, schema migration or environment variable changes.

## Verification
- Web, API and merchant TypeScript checks passed. Targeted formatting/lint and whitespace checks passed; production Vite build passed.
- Read-only production inspection of trip `0x469d9922be56f96e85537b80050b1153c190dc60` confirmed four pending proposals with missing projected quote expiries and on-chain quote cutoffs ten minutes earlier than their delivery deadlines.
- The limits investigation confirmed the selected member's $3/$5 policy in both the index and contract, with a successful PolicySet receipt; the false warning was in the UI refresh completion path.
- The World investigation found no callback in the inspected latest-attempt window, pending flows until timeout, working discovery/JWKS endpoints, and the expected issuer/callback with IDKit staging. No provider-side rejection or token-exchange failure was established.
- No test suites were run, per the owner's instruction. Deployment and post-release checks are recorded separately below.

## Deployment
- Railway API `6307903f-8514-4bc9-8ccd-d1901efa7994`, merchants `a34d4617-060b-46a9-8639-d77130745419` and web `02e7f965-c8bc-49a8-bc50-83dfd8a2310a` all succeeded.
- Public web/API/merchant health endpoints returned HTTP 200.
- Read-only post-release inspection confirmed the affected trip's five historical proposals now include `quoteExpiresAt`, matching their on-chain values. Their old authorizations remain expired; no proposal or signature was rewritten.
- A live merchant quote request returned HTTP 200 and an expiry 24 hours from issuance. The diagnostic quote was not submitted to the vault; no purchase or transfer was made.
- The World provider/browser handoff issue is still unconfirmed. These changes clarify errors but do not establish a successful new human-verification journey.

## Risk
The merchant is choosing a longer price-validity period for new quotes. Backend and contract expiry checks remain enforced. The 24-hour purchase window is separate from World authentication and short-lived attestation/approval freshness; those security time limits are unchanged. Existing expired purchases require a genuinely new quote and proposal, not revival of old authorization.
