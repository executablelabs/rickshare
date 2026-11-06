# Railway: production deployment and same-origin API proxy

## Summary

Add a Docker build and explicit web/API/merchant entry points for Railway. Serve
production assets with SPA routing and proxy `/api` to the private API, preserving
secure cookie paths, redirects and streamed responses. Include optional Caddy
configuration for local HTTPS and deployment setup instructions.

## Files

- Dockerfile, .dockerignore and .railwayignore: pinned Bun build and upload exclusions.
- scripts/start-service.ts: role-scoped, IPv6-capable Railway entry points.
- scripts/serve-web.ts: production static server and same-origin streaming API proxy.
- apps/api/src/integration/web-proxy.test.ts: real HTTP login/session/logout and proxy regression checks.
- apps/web/src/config.ts, lib/api.ts, lib/api.test.ts and lib/plan.ts: `/api` support and prefix-preserving typed auth/stream URLs.
- package.json and deploy/.env.example: start command and runtime settings.
- deploy/Caddyfile.local and docs/DEPLOYMENT.md: local HTTPS and Railway setup.
- app environment examples: current World issuer/callback and proxy base URL.

## Interfaces touched

Add `RICKSHARE_SERVICE` and `API_UPSTREAM_URL` for the deployment entry point.
Allow `/api` as the public frontend API base. Existing backend routes and contract
authorization remain unchanged; `/api` is removed only by the web proxy.
Interface paths require the other track's human review.

## Verification

- Railway identity verified against the owner's requested account before creating resources.
- API, merchants and web deployed; independent database volumes mounted at `/data`.
- Domain ownership verified and a valid HTTPS certificate issued for `rickshare.xyz`.
- Public web, proxied API and merchant health endpoints return 200.
- Real HTTP proxy tests cover secure nonce/session cookie behavior, SIWE login/logout,
  redirects, original Origin forwarding, SSE and static/deep-link path boundaries.
- Regression check verifies that typed auth and Plan stream URLs retain `/api`.
- Caddy local configuration parses successfully.
- Full post-change `bun run check`: pass (164 web, 155 API, 18 shared, 6 merchant and 98 contract tests).
- Production browser check on `rickshare.xyz`: current main landing and login modal render at
  390px and 1280px with no runtime errors or horizontal overflow. Controlled external-wallet
  login creates a matching API session, authenticated trip listing returns 200 and logout
  revokes the session (401). No transactions or model calls were made.
- A production session survived a new API image deployment and was then successfully revoked,
  confirming session-secret continuity and database-volume persistence.
- World link/start returns 200 and its authorization URL uses `auth.world.org` with the exact
  registered HTTPS callback. The attempt was cancelled without completing human verification.
- Final API, merchants and web release deployments all report success; web and proxied API health
  endpoints return 200. Screenshots are in docs/changes/deployment-{landing,login}-{390,1280}.png.

## Follow-ups

- Owner completes full Google OAuth and human World verification on the deployed domain.
- A11 live trip seed remains separate from the deployment and completed member prefunding.
