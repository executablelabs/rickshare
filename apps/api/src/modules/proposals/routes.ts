import { zValidator } from "@hono/zod-validator";
import { MerchantQuoteRequest } from "@rickshare/shared";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { requireOrigin, requireSession } from "../auth/middleware";
import type { AuthEnv, AuthService } from "../auth/service";
import type { IndexerService } from "../indexer/service";
import type { MerchantClient } from "./merchants";
import { ProposalInput, ProposalParams, TripProposalParams } from "./schemas";
import type { ProposalService } from "./service";

export function createProposalRoutes(
  auth: () => AuthService,
  indexer: () => IndexerService,
  proposals: () => ProposalService,
  merchants: () => MerchantClient,
) {
  const invalid = (success: boolean) => {
    if (!success) throw new AppError("INVALID_INPUT", "The purchase request is invalid.", 400);
  };
  return new Hono<AuthEnv>()
    .get("/merchants", requireSession(auth), async (context) =>
      context.json(await merchants().catalog()),
    )
    .post(
      "/trips/:tripId/quotes",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripProposalParams, (result) => invalid(result.success)),
      zValidator("json", MerchantQuoteRequest.omit({ vaultAddress: true }), (result) =>
        invalid(result.success),
      ),
      async (context) => {
        const { tripId } = context.req.valid("param");
        indexer().requireMember(tripId, context.get("session").address);
        return context.json(
          await merchants().quote({ ...context.req.valid("json"), vaultAddress: tripId }),
        );
      },
    )
    .get(
      "/trips/:tripId/proposals",
      requireSession(auth),
      zValidator("param", TripProposalParams, (result) => invalid(result.success)),
      (context) => {
        const { tripId } = context.req.valid("param");
        indexer().requireMember(tripId, context.get("session").address);
        return context.json({ proposals: indexer().proposals(tripId) });
      },
    )
    .post(
      "/trips/:tripId/proposals",
      requireSession(auth),
      requireOrigin(auth),
      zValidator("param", TripProposalParams, (result) => invalid(result.success)),
      zValidator("json", ProposalInput, (result) => invalid(result.success)),
      async (context) => {
        const { tripId } = context.req.valid("param");
        indexer().requireMember(tripId, context.get("session").address);
        const input = context.req.valid("json");
        const result = await proposals().submitProposal({
          tripId,
          quote: input.quote,
          shares: input.shares.map((share) => ({
            member: share.member,
            amount: BigInt(share.amount),
          })),
        });
        let indexed = true;
        try {
          await indexer().sync();
        } catch {
          indexed = false;
          logger.error("PROPOSAL_INDEX_PENDING");
        }
        return context.json({ ...result, indexed }, 201);
      },
    )
    .get(
      "/trips/:tripId/proposals/:proposalId/ticket",
      requireSession(auth),
      zValidator("param", ProposalParams, (result) => invalid(result.success)),
      async (context) => {
        const { tripId, proposalId } = context.req.valid("param");
        indexer().requireMember(tripId, context.get("session").address);
        context.header("Cache-Control", "no-store");
        return context.json(
          await proposals().ticket(tripId, proposalId, context.get("session").address),
        );
      },
    );
}
