import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { handleError } from "./lib/errors";

export const app = new Hono()
  .use("*", cors({ origin: config.WEB_ORIGIN, credentials: true }))
  .onError(handleError)
  .notFound((context) =>
    context.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404),
  )
  .get("/health", (context) => context.json({ status: "ok" } as const));

export type AppType = typeof app;
