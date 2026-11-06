import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { requireOrigin, requireSession } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import { TripParams } from "../indexer/schemas";
import {
  ConfirmCreation,
  ConfirmJoin,
  CreateInvite,
  CreateTrip,
  InviteId,
  InviteSignature,
  InviteToken,
  MemberProfile,
  TripInviteId,
} from "./schemas";
import type { TripService } from "./service";

export function createTripRoutes(auth: () => AuthService, trips: () => TripService) {
  const invalid = (success: boolean) => {
    if (!success) throw new AppError("INVALID_INPUT", "The trip request is invalid.", 400);
  };
  return new Hono<AuthEnv>()
    .get("/trips", requireSession(auth), async (context) =>
      context.json({ trips: await trips().list(context.get("session").address) }),
    )
    .post(
      "/trips",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("json", CreateTrip, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().prepare(context.get("session").address, context.req.valid("json")),
          201,
        ),
    )
    .post(
      "/trips/confirm",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("json", ConfirmCreation, (result) => invalid(result.success)),
      async (context) => {
        const input = context.req.valid("json");
        return context.json(
          await trips().confirm(
            context.get("session").address,
            input.creationId,
            input.transactionHash,
          ),
        );
      },
    )
    .get(
      "/trips/:tripId",
      requireSession(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().get(context.get("session").address, context.req.valid("param").tripId),
        ),
    )
    .patch(
      "/trips/:tripId",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("json", CreateTrip.pick({ name: true }), (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().rename(
            context.get("session").address,
            context.req.valid("param").tripId,
            context.req.valid("json").name,
          ),
        ),
    )
    .post(
      "/trips/:tripId/members/me",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("json", MemberProfile, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().profile(
            context.get("session").address,
            context.req.valid("param").tripId,
            context.req.valid("json").displayName,
          ),
        ),
    )
    .get(
      "/trips/:tripId/invites",
      requireSession(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      async (context) =>
        context.json({
          invites: await trips().invitations(
            context.get("session").address,
            context.req.valid("param").tripId,
          ),
        }),
    )
    .post(
      "/trips/:tripId/invites",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripParams, (result) => invalid(result.success)),
      zValidator("json", CreateInvite, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().createInvite(
            context.get("session").address,
            context.req.valid("param").tripId,
            context.req.valid("json").expiresAt,
          ),
          201,
        ),
    )
    .post(
      "/invites/:token/claim",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", InviteToken, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().claim(context.get("session").address, context.req.valid("param").token),
        ),
    )
    .get(
      "/invites/:inviteId",
      requireSession(auth),
      zValidator("param", InviteId, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().invite(context.get("session").address, context.req.valid("param").inviteId),
        ),
    )
    .get(
      "/trips/:tripId/invites/:inviteId/authorization",
      requireSession(auth),
      zValidator("param", TripInviteId, (result) => invalid(result.success)),
      async (context) => {
        const input = context.req.valid("param");
        return context.json(
          await trips().authorize(context.get("session").address, input.tripId, input.inviteId),
        );
      },
    )
    .post(
      "/trips/:tripId/invites/:inviteId/authorization",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripInviteId, (result) => invalid(result.success)),
      zValidator("json", InviteSignature, (result) => invalid(result.success)),
      async (context) => {
        const input = context.req.valid("param");
        return context.json(
          await trips().authorize(
            context.get("session").address,
            input.tripId,
            input.inviteId,
            context.req.valid("json").signature,
          ),
        );
      },
    )
    .post(
      "/invites/:inviteId/confirm",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", InviteId, (result) => invalid(result.success)),
      zValidator("json", ConfirmJoin, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await trips().confirmJoin(
            context.get("session").address,
            context.req.valid("param").inviteId,
            context.req.valid("json").transactionHash,
          ),
        ),
    );
}
