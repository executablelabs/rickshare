# World human-in-the-loop approvals

## Flow

Manual share approval has three stages when `WORLD_HUMAN_APPROVAL_ENABLED=true`:

1. Fresh World OIDC authentication must match the identity already linked to the signed-in wallet.
2. The member reviews the exact share and proves humanity using the World human-in-the-loop React hook and the IDKit 4.0 Proof of Human widget.
3. The API verifies the action-bound proof, re-reads the chain context, atomically consumes its nullifier and releases a short-lived EIP-712 attestation. The member's own wallet still sends `approve`.

Existing automatic approvals operate only within the limits that the member already authorized. The proof does not give the agent a payer key or complete the separate Arc-vault-to-x402 payment adapter.

## SDK and runtime

Pinned dependencies:

- `@worldcoin/human-in-the-loop-react@0.1.1`: official approval-context/verification hook.
- `@worldcoin/idkit@4.6.0`: World ID proof widget and credential preset.
- `@worldcoin/idkit-server@1.1.1`: server-only RP request signatures.
- `ai@5.0.76`: the React SDK's UI-message/tool-part peer dependency; the planner retains its existing model integration.

This is a native Hono/Bun adapter for the published proof-based SDK protocol. Pending approval state and consumed nullifiers live in SQLite, and the purchase remains pending in the vault. It does not use the Vercel Workflow server factory. World's newer GitHub device-authorization implementation differs from the published React package; this implementation does not mix those incompatible APIs.

## Portal and Railway setup

Keep the existing OIDC configuration. In the World developer portal, enable World ID 4.0 for the intended app and obtain its app ID, RP ID and registered RP signing key. These are separate from the OIDC client credentials and the contract-attestation verifier key.

Set these on the Railway **API** service:

```dotenv
WORLD_HUMAN_APPROVAL_ENABLED=true
WORLD_APP_ID=app_...
WORLD_RP_ID=rp_...
WORLD_SIGNING_KEY=...
```

The signing key is server-only. Do not put it in `VITE_` variables, chat, screenshots or source control. The API returns only public app/RP metadata and short-lived request signatures to the browser. No new frontend environment variables are required.

Deploy the API, migration and web integration together, then enable the flag after all RP values are configured. The default is false, preserving the existing OIDC-only approval flow until activation. Enabling it without RP credentials blocks manual approvals with `WORLD_HUMAN_NOT_CONFIGURED`; it does not silently bypass proof verification.

The SDK webhook uses the signed-in session cookie, so it must use the same-origin `/api` proxy. Production already does this. For local live verification, use the documented Caddy/web-proxy setup in `DEPLOYMENT.md`. A cross-origin development API shows a configuration message instead of sending an unauthenticated proof.

## Binding and replay protection

The server derives each action from the request ID, chain, vault, proposal, member, share amount, approval nonce, proposal deadline and quote expiry. The proof signal is the namespaced canonical member address (`rickshare-member:0x...`), encoded as UTF-8 rather than an ambiguous raw hex input. The member cannot supply a different action or obtain an arbitrary RP signature.

The backend accepts one production World ID 4.0 Proof of Human credential, forwards the complete validated result to the pinned RP verification endpoint, and requires both overall and credential-level verification success. Staging, sandbox, legacy and session proofs are rejected. It checks the action, RP nonce, wallet signal and expiry before verification, then checks the on-chain operation again before signing.

Nullifiers are normalized as integers and hashed with the RP/action before durable one-time consumption. Consumption and the verified attestation are committed atomically. A cancellation, changed share/nonce, expired session or request, replay, or malformed verifier response exposes no approval signature. Raw World proofs and identity tokens are not persisted or logged by this flow.

Migration `0010_world_human_approvals` adds the consumption table without changing vault contracts or existing identity links. API restarts preserve a pending proof challenge; expired challenges require a new approval attempt. Same-tab OIDC callbacks return to the proposal's trip with its opaque request ID; clicking approval again resumes that stored request rather than requiring another identity round trip. A lost proof-webhook response can be checked against server status before retrying a wallet action.

## Live acceptance check

After portal configuration and deployment, use a real World ID 4.0 user to link the intended wallet, start a manual share approval, complete the identity and proof stages, and confirm the wallet transaction. Confirm the approval is for only that member's share and that replay, cancellation and expired requests cannot approve again.

Local tests use signed fixtures and a stub verification endpoint. They do not certify a live World proof or replace this real-user acceptance check.
