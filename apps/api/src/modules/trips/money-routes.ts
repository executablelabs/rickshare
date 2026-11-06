import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { requireOrigin, requireSession } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import { TripParams } from "../indexer/schemas";
import type { MoneyService } from "./money";
import { HistoryQuery, MoneyAction } from "./money-schemas";

export function createMoneyRoutes(auth: () => AuthService, money: () => MoneyService) {
  const invalid = (success: boolean) => {
    if (!success) throw new AppError("INVALID_INPUT", "The money request is invalid.", 400);
  };
  return new Hono<AuthEnv>()
    .get(
      "/trips/:tripId/money",
      requireSession(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await money().balances(context.get("session").address, context.req.valid("param").tripId),
        ),
    )
    .get(
      "/trips/:tripId/history",
      requireSession(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("query", HistoryQuery, (result) => invalid(result.success)),
      async (context) => {
        const query = context.req.valid("query");
        return context.json(
          await money().history(
            context.get("session").address,
            context.req.valid("param").tripId,
            query.limit,
            query.before,
          ),
        );
      },
    )
    .post(
      "/trips/:tripId/actions",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("json", MoneyAction, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await money().prepare(
            context.get("session").address,
            context.req.valid("param").tripId,
            context.req.valid("json"),
          ),
        ),
    );
}
