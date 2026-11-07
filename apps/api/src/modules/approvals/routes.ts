import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie } from "hono/cookie";
import { AppError } from "../../lib/errors";
import { requireOrigin, requireSession, SESSION_COOKIE } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import { WorldHumanProof } from "./proof";
import { ApprovalParams, WorldCallback, WorldRequestParams } from "./schemas";
import type { WorldApprovalService } from "./service";

export function createApprovalRoutes(auth: () => AuthService, world: () => WorldApprovalService) {
  const invalid = (success: boolean) => {
    if (!success) throw new AppError("INVALID_INPUT", "The World request is invalid.", 400);
  };
  return new Hono<AuthEnv>()
    .get("/world/status", requireSession(auth), (context) =>
      context.json({ linked: world().isLinked(context.get("session").address) }),
    )
    .post("/world/link/start", requireSession(auth), requireOrigin(auth), async (context) =>
      context.json(await world().start(getCookie(context, SESSION_COOKIE))),
    )
    .post(
      "/trips/:tripId/proposals/:proposalId/approval/start",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", ApprovalParams, (result) => invalid(result.success)),
      async (context) => {
        const input = context.req.valid("param");
        return context.json(
          await world().start(getCookie(context, SESSION_COOKIE), {
            vault: input.tripId,
            proposalId: BigInt(input.proposalId),
          }),
        );
      },
    )
    .get(
      "/world/callback",
      requireSession(auth),
      zValidator("query", WorldCallback, (result) => invalid(result.success)),
      async (context) => {
        const input = context.req.valid("query");
        const result = await world().finish(getCookie(context, SESSION_COOKIE), input);
        const url = new URL(auth().origin);
        const state = world().status(getCookie(context, SESSION_COOKIE), input.state);
        const vault = state.humanApproval?.share.vaultAddress ?? state.attestation?.vaultAddress;
        if (vault) url.pathname = `/trips/${vault.toLowerCase()}/plan`;
        url.searchParams.set("world_request", input.state);
        url.searchParams.set("world_status", result.status);
        return context.redirect(url.toString());
      },
    )
    .get(
      "/world/requests/:requestId",
      requireSession(auth),
      zValidator("param", WorldRequestParams, (result) => invalid(result.success)),
      (context) => {
        context.header("Cache-Control", "no-store");
        return context.json(
          world().status(getCookie(context, SESSION_COOKIE), context.req.valid("param").requestId),
        );
      },
    )
    .post(
      "/world/requests/:requestId/proof",
      requireSession(auth),
      requireOrigin(auth),
      bodyLimit({
        maxSize: 65536,
        onError: () => {
          throw new AppError("INVALID_INPUT", "The World proof is too large.", 413);
        },
      }),
      zValidator("param", WorldRequestParams, (result) => invalid(result.success)),
      zValidator("json", WorldHumanProof, (result) => invalid(result.success)),
      async (context) =>
        context.json(
          await world().finishProof(
            getCookie(context, SESSION_COOKIE),
            context.req.valid("param").requestId,
            context.req.valid("json"),
          ),
        ),
    )
    .post(
      "/world/requests/:requestId/cancel",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", WorldRequestParams, (result) => invalid(result.success)),
      (context) =>
        context.json(
          world().cancel(getCookie(context, SESSION_COOKIE), context.req.valid("param").requestId),
        ),
    );
}
