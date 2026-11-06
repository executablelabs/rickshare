import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { AppError } from "../../lib/errors";
import { requireOrigin, requireSession, SESSION_COOKIE } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import { TripParams } from "../indexer/schemas";
import type { IndexerService } from "../indexer/service";
import type { ItineraryStore } from "../trips/itinerary";
import type { ChatCoordinator } from "./coordinator";
import { ChatInput, ChatQuery, StreamCursor } from "./schemas";
import type { ChatStore } from "./service";
import { streamTripEvents } from "./stream";

export function createChatRoutes(options: {
  auth: () => AuthService;
  indexer: () => IndexerService;
  chat: () => ChatStore;
  coordinator: () => ChatCoordinator;
  itinerary: () => ItineraryStore;
  heartbeatMs?: number;
}) {
  const invalid = (success: boolean) => {
    if (!success) throw new AppError("INVALID_INPUT", "The chat request is invalid.", 400);
  };
  return new Hono<AuthEnv>()
    .get(
      "/trips/:tripId/chat",
      requireSession(options.auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("query", ChatQuery, (result) => invalid(result.success)),
      (context) => {
        const tripId = context.req.valid("param").tripId.toLowerCase();
        options.indexer().requireMember(tripId, context.get("session").address);
        return context.json({
          messages: options.chat().listRecent(tripId, context.req.valid("query").limit),
        });
      },
    )
    .post(
      "/trips/:tripId/chat",
      requireSession(options.auth),
      requireOrigin(options.auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("json", ChatInput, (result) => invalid(result.success)),
      async (context) => {
        const tripId = context.req.valid("param").tripId.toLowerCase();
        options.indexer().requireMember(tripId, context.get("session").address);
        const result = await options
          .coordinator()
          .post(tripId, context.get("session").address, context.req.valid("json"));
        return context.json(result, result.status === "processing" ? 202 : 200);
      },
    )
    .get(
      "/trips/:tripId/itinerary",
      requireSession(options.auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      (context) => {
        const tripId = context.req.valid("param").tripId.toLowerCase();
        options.indexer().requireMember(tripId, context.get("session").address);
        // Ticket bearer links are retrieved separately through the participant-only ticket API.
        return context.json({
          items: options
            .itinerary()
            .list(tripId)
            .map((item) => ({ ...item, ticketUrls: [] })),
        });
      },
    )
    .get(
      "/trips/:tripId/stream",
      requireSession(options.auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      (context) => {
        const tripId = context.req.valid("param").tripId.toLowerCase();
        const indexer = options.indexer();
        indexer.requireMember(tripId, context.get("session").address);
        const parsed = StreamCursor.safeParse(
          context.req.header("Last-Event-ID") ?? context.req.query("after") ?? "0",
        );
        if (!parsed.success)
          throw new AppError("INVALID_CURSOR", "The stream cursor is invalid.", 400);
        const token = getCookie(context, SESSION_COOKIE);
        if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
        return streamTripEvents(
          context,
          indexer,
          options.auth(),
          tripId,
          parsed.data,
          token,
          options.heartbeatMs,
        );
      },
    );
}
