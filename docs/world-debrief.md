# World authentication integration

## Implemented protocol

An opt-in proof-based human-in-the-loop layer is now implemented on top of the existing linked-identity check. See [WORLD-HUMAN-APPROVAL.md](WORLD-HUMAN-APPROVAL.md) for its pinned published SDKs, action/nonce/signal binding, replay protection and separate RP configuration. The notes below describe the original OIDC layer and its original verification scope.

The supplied Track A plan specifies fresh OIDC authentication, a wallet-to-subject
link and backend EIP-712 attestations. The implementation follows that protocol.
World's live discovery endpoint was inspected at
https://id.worldcoin.org/.well-known/openid-configuration and advertises code
flow, S256 PKCE, RS256, /authorize, /token and /jwks.json.

The current public World documentation also describes a separate proof-based
human-in-the-loop product at
https://docs.world.org/agents/human-in-the-loop/integrate.md. That product uses
RP-signed IDKit proofs rather than this plan's OIDC auth_time/sub flow. This repo
does not claim that OIDC by itself integrates that distinct SDK or satisfies an
Agent Pass sponsor requirement. The opt-in proof layer is documented separately.

## Required external setup

1. Sign in at https://developer.world.org and register an application supporting
   World sign-in/OIDC. Registration requires the owner's account access.
2. Register the exact backend callback URL `/world/callback` and web origin.
3. Supply issuer, client ID and secret in the ignored API .env file. Keep the
   client secret server-side. The issuer for the inspected discovery is
   https://id.worldcoin.org.
4. Confirm in a real sign-in that the provider honors prompt=login/max_age=0 and
   returns auth_time and nonce. Missing or stale claims fail closed.
5. Link each wallet before depositing funds, then exercise approvals with the
   same World identity. There is no silent relinking to a different person.

## Tested behavior

Unit tests verify real RSA-signed JWTs and reject wrong keys, issuer, audience,
authorized party, nonce, missing/stale/future auth_time and expired tokens.
Service/route tests cover successful linking and exact contract signatures,
wrong-subject rejection, session binding, denied/cancelled/expired requests,
one-time callbacks and cancellation while a token exchange is in flight.

These local tests do not constitute live provider certification. A real World
application, callback registration and human login are still required for live
end-to-end verification. Credentials and human proofs are never simulated on
the production request path.
