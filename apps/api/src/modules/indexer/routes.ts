import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { requireSession } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import { EventQuery, TripParams } from "./schemas";
import type { IndexerService } from "./service";

export function createIndexerRoutes(auth: () => AuthService, indexer: () => IndexerService) {
  return new Hono<AuthEnv>().get(
    "/trips/:tripId/events",
    requireSession(auth),
    zValidator("param", TripParams, (result) => {
      if (!result.success) throw new AppError("INVALID_TRIP", "A vault address is required.", 400);
    }),
    zValidator("query", EventQuery, (result) => {
      if (!result.success)
        throw new AppError("INVALID_CURSOR", "The event cursor is invalid.", 400);
    }),
    (context) => {
      const { tripId } = context.req.valid("param");
      const { after, limit } = context.req.valid("query");
      const service = indexer();
      service.requireMember(tripId, context.get("session").address);
      context.header("Cache-Control", "no-store");
      return context.json({ events: service.events(tripId, after, limit) });
    },
  );
}
