/// <reference types="bun" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { handleError } from "./lib/errors";
import { createApprovalRoutes } from "./modules/approvals/routes";
import { createAuthRoutes } from "./modules/auth/routes";
import type { AuthEnv } from "./modules/auth/service";
import { createIndexerRoutes } from "./modules/indexer/routes";
import { createRuntime, type Runtime, type RuntimeOptions } from "./runtime";

export function createApp(options: RuntimeOptions & { runtime?: Runtime } = {}) {
  const runtime = options.runtime ?? createRuntime(options);
  return new Hono<AuthEnv>()
    .use("*", cors({ origin: config.WEB_ORIGIN, credentials: true }))
    .onError(handleError)
    .notFound((context) =>
      context.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404),
    )
    .get("/health", (context) => context.json({ status: "ok" } as const))
    .route("/auth", createAuthRoutes(runtime.auth))
    .route("/", createIndexerRoutes(runtime.auth, runtime.indexer))
    .route("/", createApprovalRoutes(runtime.auth, runtime.world));
}

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
