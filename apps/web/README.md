# Web setup

From the repository root, install dependencies with `bun install`. Copy
`apps/web/.env.example` to `apps/web/.env` and configure:

- `VITE_PRIVY_APP_ID`: the public app ID from an owner-created Privy application.
  Enable email login and add `http://localhost:5173` to its allowed origins for local development.
  Add any alternate development port or deployed web origin explicitly; an unlisted origin can
  block Privy's iframe and leave sign-in waiting for initialization.
  The app creates an Ethereum embedded wallet for users without a wallet; no extension is required.
- `VITE_API_URL`: defaults to `http://localhost:8787`. The API's `WEB_ORIGIN` must match
  the browser origin exactly. Use `localhost` consistently for both services locally.
- `VITE_ARC_RPC_URL`: optional public Arc testnet RPC override; blank uses the chain's default.

Start the services with `bun run dev`. Continue with email, then use Continue again to
approve the Rickshare sign-in message. This creates the API's HttpOnly SIWE session;
the Privy login itself is not an API session or an approval to spend funds.
Production web and API endpoints need same-site HTTPS hosting for the API's SameSite cookies.
Never put a Privy app secret or any private key in a `VITE_` variable.

Without an app ID, private routes display an explicit setup message. `/dev/ui` remains
available for the component gallery. Live email verification requires the owner's
Privy application; unit tests stub the SDK, RPC and API and require no accounts.
The Vitest configuration overrides the local Privy app ID so a configured `.env` does not enable hosted login in tests.

Session queries live in TanStack Query. An account change creates a new query cache and
remounts private UI; logout cancels requests and clears cached private data. New trip
queries and stream cursors must additionally include the trip ID in their keys.

Run `bun --filter @rickshare/web test` for component tests and
`bun --filter @rickshare/web build` for the production bundle.
