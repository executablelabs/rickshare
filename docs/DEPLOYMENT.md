# Railway deployment

Rickshare runs as three services in the [Railway project](https://railway.com/project/ff3a1cbf-983c-4513-bdab-511d1a3106ba).
Railway terminates public HTTPS; Caddy is used only for optional local HTTPS.

| Service   | Entry point                   | Storage                                    | Network                                                                                      |
| --------- | ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| web       | `RICKSHARE_SERVICE=web`       | Static Vite build                          | `https://rickshare.xyz`                                                                      |
| api       | `RICKSHARE_SERVICE=api`       | `/data/api.sqlite` on its own volume       | Private port 8787, exposed through web `/api`                                                |
| merchants | `RICKSHARE_SERVICE=merchants` | `/data/merchants.sqlite` on its own volume | Private port 8790; public ticket pages at `https://merchants-production-79f1.up.railway.app` |

Each service uses the root Dockerfile and `bun run start`. The web image builds the
frontend using public `VITE_` build arguments. Backend credentials are runtime
variables; local environments, databases and keys are excluded from uploads and images.
Keep one replica per database-backed service. Railway health checks use `/health`.

## Configuration

Use `deploy/.env.example` for the production entry-point variables and each app's
existing `.env.example` for its service settings. Store actual values in Railway.

- Web: `PORT=8080`, `VITE_API_URL=/api`, public `VITE_PRIVY_APP_ID`, and
  `API_UPSTREAM_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8787`.
- API: `PORT=8787`, `DATABASE_PATH=/data/api.sqlite`, `WEB_ORIGIN=https://rickshare.xyz`,
  `MERCHANTS_URL=http://${{merchants.RAILWAY_PRIVATE_DOMAIN}}:8790`, and its role-scoped
  keys, model/search credentials and session secret.
- Merchants: `PORT=8790`, `MERCHANT_DATABASE_PATH=/data/merchants.sqlite`,
  `PUBLIC_URL=https://merchants-production-79f1.up.railway.app`, and the merchant keys.
- API and merchants: matching `MERCHANTS_API_SECRET`, deployed `TRIP_FACTORY_ADDRESS`,
  Arc RPC and `ARC_START_BLOCK=70991387` for the confirmed factory deployment.
- World: `WORLD_ISSUER=https://auth.world.org` and
  `WORLD_REDIRECT_URI=https://rickshare.xyz/api/world/callback`. Register that exact
  callback with the OIDC client using `client_secret_basic`.
- Privy: allow `https://rickshare.xyz` and enable email, Google and Ethereum wallet login.

The web proxy strips `/api` and rewrites the auth nonce cookie path to `/api/auth`.
Session cookies retain their root path, HttpOnly, Secure and SameSite attributes.
World redirects and the streaming Plan feed pass through the same origin.

## Deploy updates

Authenticate the CLI to the project's owner account, link the checkout to this project,
and deploy the intended revision:

```sh
railway login
railway link --project ff3a1cbf-983c-4513-bdab-511d1a3106ba
railway up --service api --detach
railway up --service merchants --detach
railway up --service web --detach
```

Configure `/health` checks, single replicas and attached `/data` volumes before
starting the API or merchants. Session and ticket databases must remain on their volumes
across redeploys. Schema migrations run when the API opens its database.
Run only one merchant issuer per merchant/factory: use Anvil for local development or
stop a local Arc watcher before using the Railway issuer for that same factory.

For `rickshare.xyz`, the Porkbun apex ALIAS targets `9lw0k04e.up.railway.app`.
Railway's domain settings provide the current ownership TXT record and certificate status.

## Local HTTPS with Caddy

Build the web app with `VITE_API_URL=/api`, set `RICKSHARE_SERVICE=web`, `PORT=8080`,
and `API_UPSTREAM_URL=http://localhost:8787`, then run `bun run start`.
Run the API locally with `WEB_ORIGIN=https://localhost` and configure Privy to allow
that origin. For local World testing also register and configure
`https://localhost/api/world/callback`.

```sh
caddy run --config deploy/Caddyfile.local --adapter caddyfile
```

Caddy uses its internal CA for localhost and may request local certificate trust.
The template is not part of the Railway runtime.
