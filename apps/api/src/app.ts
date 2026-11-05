/// <reference types="bun" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { createDatabase } from "./db/client";
import { AppError, handleError } from "./lib/errors";
import { createAuthRoutes } from "./modules/auth/routes";
import { type AuthEnv, AuthService } from "./modules/auth/service";
import { createArcClient } from "./modules/chain/clients";

export function createApp(options: { auth?: AuthService } = {}) {
  let auth = options.auth;
  const getAuth = () => {
    if (auth) return auth;
    if (!config.SESSION_SECRET)
      throw new AppError("AUTH_NOT_CONFIGURED", "Session signing is not configured.", 503);
    const chain = createArcClient();
    auth = new AuthService(createDatabase(), {
      origin: config.WEB_ORIGIN,
      secret: config.SESSION_SECRET,
      nonceTtlSeconds: config.AUTH_NONCE_TTL_SECONDS,
      sessionTtlSeconds: config.SESSION_TTL_SECONDS,
      verifySignature: (input) => chain.verifyMessage(input),
    });
    return auth;
  };
  return new Hono<AuthEnv>()
    .use("*", cors({ origin: config.WEB_ORIGIN, credentials: true }))
    .onError(handleError)
    .notFound((context) =>
      context.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404),
    )
    .get("/health", (context) => context.json({ status: "ok" } as const))
    .route("/auth", createAuthRoutes(getAuth));
}

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
