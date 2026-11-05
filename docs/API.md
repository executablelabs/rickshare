# Track A API handoff

## Wallet sessions (A6)

All browser writes send `Origin: WEB_ORIGIN`; browser requests include cookies
with `credentials: include`. Sessions are opaque, HttpOnly and revocable. HTTPS
origins use Secure cookies; local HTTP development uses non-Secure cookies.

1. GET `/auth/nonce` returns `{ nonce }` and an HttpOnly challenge cookie.
2. Construct a SIWE v1 message for chain 5042002, `domain` equal to the web
   origin's host and `uri` equal to the exact web origin. Include current
   `issuedAt` and the returned nonce; sign it using the user's wallet.
3. POST `/auth/verify` with `{ message, signature }` returns
   `{ address, expiresAt }` and sets the session cookie. The nonce is single-use
   and bound to the requesting browser's challenge cookie.
4. GET `/auth/session` returns that same public session shape, or 401.
5. POST `/auth/logout` revokes the server-side session and clears the cookie.

The verifier supports EOA and EIP-1271 wallet signatures through viem's Arc
client. An ordinary login never authorizes a payment: A8 separately requires
fresh World authentication before issuing an onchain approval attestation.

Every error uses `{ error: { code, message } }`. Integration endpoints fail with
a configuration error when their required real credentials are missing; the
health endpoint remains available without external credentials.
