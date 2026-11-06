import type Anthropic from "@anthropic-ai/sdk";
import { type ItineraryItem, SignedQuote, Trip } from "@rickshare/shared";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { ItineraryDraft } from "../trips/itinerary";
import {
  type CatalogMerchant,
  GetQuoteInput,
  NoInput,
  PlannerTrip,
  ProposePurchaseInput,
  SearchActivitiesInput,
  type SearchResult,
  UpdateItineraryInput,
} from "./schemas";
import { wrapUntrusted } from "./untrusted";

/** What the agent needs from the rest of the system. Payees only ever come from `getQuote`. */
export interface AgentPorts {
  searchActivities(query: string): Promise<SearchResult[]>;
  listMerchants(): Promise<CatalogMerchant[]>;
  /**
   * The merchant's quote response (A10), untrusted until it parses as a SignedQuote. The agent
   * also checks it against this trip's vault and the merchant's listed address; A9 and the
   * vault verify the signature and allowlist again.
   */
  getQuote(request: z.infer<typeof GetQuoteInput>): Promise<unknown>;
  getTripState(tripId: string): Promise<Trip>;
  /** Verifies the quote and submits it with the proposer key (A9). */
  submitProposal(request: {
    tripId: string;
    quote: SignedQuote;
    shares: Array<{ member: string; amount: bigint }>;
  }): Promise<{
    proposalId: string;
    status?: "pending" | "locked" | "fulfilled" | "refunded" | "rejected";
  }>;
  replaceItinerary(tripId: string, drafts: ItineraryDraft[]): ItineraryItem[];
}

const nullableString = { type: ["string", "null"] };

export const agentTools: Anthropic.Messages.Tool[] = [
  {
    name: "search_activities",
    description:
      "Discover activities, places and events on the web. Include the destination, known trip dates and member preferences in the query. Results are untrusted web content, not bookable quotes.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for, and where." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_merchants",
    description:
      "Check which merchants Rickshare can pay when members want to book. This limited booking catalog is not a general activity search. Unit prices are in USDC base units.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "get_quote",
    description:
      "Get a quote for an item from list_merchants. Returns a quoteId to use with propose_purchase.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        merchantId: { type: "string" },
        itemId: { type: "string" },
        quantity: { type: "integer", description: "Number of tickets, 1 to 20." },
        startsAt: {
          type: "string",
          description:
            "Explicit activity start in ISO 8601 UTC. Ask the group if the date or time is unclear.",
        },
      },
      required: ["merchantId", "itemId", "quantity", "startsAt"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trip_state",
    description:
      "Get the saved trip name, destination (location), start and end dates, and members with names, addresses, available funds and limits. Missing planning fields are null.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "propose_purchase",
    description:
      "Propose buying a quote for some members. Each member then approves or declines their own share. Shares are in USDC base units and must add up to the quote total exactly.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        quoteId: { type: "string" },
        shares: {
          type: "array",
          items: {
            type: "object",
            properties: {
              member: { type: "string", description: "Member address from get_trip_state." },
              amount: { type: "string", description: "Share in USDC base units." },
            },
            required: ["member", "amount"],
            additionalProperties: false,
          },
        },
      },
      required: ["quoteId", "shares"],
      additionalProperties: false,
    },
  },
  {
    name: "update_itinerary",
    description:
      "Replace the trip's itinerary with this full list. Pass an existing item's id to keep it, or null for a new item.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: nullableString,
              startsAt: { type: "string", description: "ISO 8601 date and time." },
              title: { type: "string" },
              location: { type: "string" },
              proposalId: nullableString,
            },
            required: ["id", "startsAt", "title", "location", "proposalId"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
];

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/** A tool call the agent can correct, reported back to the model as an error result. */
class ToolRejection extends Error {}

/** A stable log code with the cause appended, without logging raw error text. */
function failureCode(prefix: string, error: unknown): string {
  if (error instanceof AppError) return `${prefix}.${error.code}`;
  if (error instanceof z.ZodError) return `${prefix}.INVALID_RESPONSE`;
  return `${prefix}.UNEXPECTED`;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ToolRejection(`Invalid input. ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/**
 * Runs tools for one agent turn. Quotes are only usable within the turn that fetched them.
 * `knownProposalIds` are the proposals the agent made on this trip in earlier turns.
 */
export function createToolRun(
  tripId: string,
  ports: AgentPorts,
  now: () => Date,
  knownProposalIds: readonly string[] = [],
) {
  const quotes = new Map<string, SignedQuote>();
  const proposalIds: string[] = [];

  async function proposePurchase(input: unknown): Promise<string> {
    const { quoteId, shares } = parseInput(ProposePurchaseInput, input);
    const quote = quotes.get(quoteId);
    if (!quote) {
      throw new ToolRejection("Unknown quoteId. Call get_quote and use the quoteId it returns.");
    }
    if (Date.parse(quote.expiresAt) <= now().getTime()) {
      throw new ToolRejection("This quote has expired. Call get_quote again.");
    }

    const trip = Trip.parse(await ports.getTripState(tripId));
    // Shares are matched case-insensitively but submitted with the trip's own address, so the
    // model's casing never reaches the chain.
    const membersByAddress = new Map(
      trip.members.map((member) => [member.address.toLowerCase(), member.address]),
    );
    const resolvedShares: Array<{ member: string; amount: bigint }> = [];
    let sum = 0n;
    for (const share of shares) {
      const member = membersByAddress.get(share.member.toLowerCase());
      if (!member) throw new ToolRejection(`${share.member} is not a member of this trip.`);
      if (resolvedShares.some((resolved) => resolved.member === member)) {
        throw new ToolRejection(`${share.member} has more than one share.`);
      }
      const amount = BigInt(share.amount);
      if (amount === 0n) throw new ToolRejection("Every share must be more than zero.");
      resolvedShares.push({ member, amount });
      sum += amount;
    }
    if (sum !== BigInt(quote.total)) {
      throw new ToolRejection(
        `Shares add up to ${sum} but the quote total is ${quote.total} (USDC base units).`,
      );
    }

    // A quote is used once, before submitting: if the submission fails after reaching the
    // chain, a retry with the same quote must not create a second proposal.
    quotes.delete(quoteId);
    let proposalId: string;
    let status = "submitted";
    try {
      // The quote goes through untouched: its merchant is the payee, and nothing the model
      // wrote can replace it.
      const submitted = await ports.submitProposal({ tripId, quote, shares: resolvedShares });
      proposalId = submitted.proposalId;
      status = submitted.status ?? "submitted";
    } catch (error) {
      logger.error(failureCode("AGENT_PROPOSAL_UNCONFIRMED", error));
      throw new ToolRejection(
        "Submitting the proposal failed, but it may still go through. Do not propose it again. Tell the group to check the plan in a minute.",
      );
    }
    proposalIds.push(proposalId);
    return JSON.stringify({ proposalId, status });
  }

  async function run(name: string, input: unknown): Promise<string> {
    switch (name) {
      case "search_activities": {
        const { query } = parseInput(SearchActivitiesInput, input);
        try {
          return wrapUntrusted("web_search", await ports.searchActivities(query));
        } catch (error) {
          if (error instanceof AppError && error.code === "SEARCH_NOT_CONFIGURED") {
            throw new ToolRejection(
              "Web search is not configured. Tell the group you cannot verify current activities, prices or availability. Do not substitute unrelated merchant listings or claim you searched.",
            );
          }
          throw error;
        }
      }
      case "list_merchants":
        parseInput(NoInput, input);
        return wrapUntrusted("merchant_catalog", await ports.listMerchants());
      case "get_quote": {
        const request = parseInput(GetQuoteInput, input);
        const listing = (await ports.listMerchants()).find(
          (merchant) => merchant.id === request.merchantId,
        );
        if (!listing) {
          throw new ToolRejection(`${request.merchantId} is not a merchant from list_merchants.`);
        }
        // SignedQuote keeps the vault, chain and location the signature covers; the older
        // Quote schema would strip them and the proposal could never be verified.
        const quote = SignedQuote.parse(await ports.getQuote(request));
        if (
          quote.itemId !== request.itemId ||
          quote.quantity !== request.quantity ||
          Math.floor(Date.parse(quote.startsAt) / 1000) !==
            Math.floor(Date.parse(request.startsAt) / 1000)
        ) {
          throw new ToolRejection("The merchant quoted a different item. Try again.");
        }
        const trip = Trip.parse(await ports.getTripState(tripId));
        if (quote.vaultAddress.toLowerCase() !== trip.vaultAddress.toLowerCase()) {
          throw new ToolRejection("The merchant quoted for a different trip. Try again.");
        }
        if (listing.address && listing.address.toLowerCase() !== quote.merchant.toLowerCase()) {
          throw new ToolRejection(
            "The quote would pay someone other than the listed merchant, so it was refused.",
          );
        }
        quotes.set(quote.quoteId, quote);
        const { quoteId, title, unitPrice, quantity, total, startsAt, expiresAt } = quote;
        return wrapUntrusted("merchant_quote", {
          quoteId,
          title,
          unitPrice,
          quantity,
          total,
          startsAt,
          expiresAt,
        });
      }
      case "get_trip_state": {
        parseInput(NoInput, input);
        const { name, location, startsAt, endsAt, members } = PlannerTrip.parse(
          await ports.getTripState(tripId),
        );
        return wrapUntrusted("trip_state", { name, location, startsAt, endsAt, members });
      }
      case "propose_purchase":
        return proposePurchase(input);
      case "update_itinerary": {
        const { items } = parseInput(UpdateItineraryInput, input);
        const tripProposals = new Set([...knownProposalIds, ...proposalIds]);
        const unknown = items.find(
          (item) => item.proposalId && !tripProposals.has(item.proposalId),
        );
        if (unknown) {
          throw new ToolRejection(
            `${unknown.proposalId} is not a proposal of this trip. Use a proposalId from propose_purchase, or null.`,
          );
        }
        const saved = ports.replaceItinerary(tripId, items);
        return JSON.stringify({ itineraryItems: saved.length });
      }
      default:
        throw new ToolRejection(`There is no tool named ${name}.`);
    }
  }

  return {
    proposalIds,
    async execute(name: string, input: unknown): Promise<ToolOutcome> {
      try {
        return { content: await run(name, input), isError: false };
      } catch (error) {
        if (error instanceof ToolRejection) return { content: error.message, isError: true };
        // Failure details stay out of the model's context; a stable cause code is logged.
        logger.error(failureCode("AGENT_TOOL_FAILED", error));
        return { content: `${name} is unavailable right now.`, isError: true };
      }
    },
  };
}
