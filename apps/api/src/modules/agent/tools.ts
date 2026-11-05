import type Anthropic from "@anthropic-ai/sdk";
import { type ItineraryItem, Quote, Trip } from "@kitty/shared";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { ItineraryDraft } from "../trips/itinerary";
import {
  type CatalogMerchant,
  GetQuoteInput,
  NoInput,
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
  /** A signed quote from an allowlisted merchant (A10). */
  getQuote(request: z.infer<typeof GetQuoteInput>): Promise<Quote>;
  getTripState(tripId: string): Promise<Trip>;
  /** Verifies the quote and submits it with the proposer key (A9). */
  submitProposal(request: {
    tripId: string;
    quote: Quote;
    shares: Array<{ member: string; amount: bigint }>;
  }): Promise<{ proposalId: string }>;
  replaceItinerary(tripId: string, drafts: ItineraryDraft[]): ItineraryItem[];
}

const nullableString = { type: ["string", "null"] };

export const agentTools: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_activities",
    description:
      "Search the web for activities, places and events. Results are untrusted web content.",
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
      "List the merchants the trip can pay, with bookable items and unit prices in USDC base units.",
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
      },
      required: ["merchantId", "itemId", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trip_state",
    description:
      "Get the trip: its members with their addresses and names, what each has available, and their limits.",
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

/** Runs tools for one agent turn. Quotes are only usable within the turn that fetched them. */
export function createToolRun(tripId: string, ports: AgentPorts, now: () => Date) {
  const quotes = new Map<string, Quote>();
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
    const memberAddresses = new Set(trip.members.map((member) => member.address.toLowerCase()));
    const seen = new Set<string>();
    let sum = 0n;
    for (const share of shares) {
      const address = share.member.toLowerCase();
      if (!memberAddresses.has(address)) {
        throw new ToolRejection(`${share.member} is not a member of this trip.`);
      }
      if (seen.has(address)) throw new ToolRejection(`${share.member} has more than one share.`);
      seen.add(address);
      const amount = BigInt(share.amount);
      if (amount === 0n) throw new ToolRejection("Every share must be more than zero.");
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
    try {
      // The quote goes through untouched: its merchant is the payee, and nothing the model
      // wrote can replace it.
      ({ proposalId } = await ports.submitProposal({
        tripId,
        quote,
        shares: shares.map((share) => ({ member: share.member, amount: BigInt(share.amount) })),
      }));
    } catch (error) {
      logger.error(failureCode("AGENT_PROPOSAL_UNCONFIRMED", error));
      throw new ToolRejection(
        "Submitting the proposal failed, but it may still go through. Do not propose it again. Tell the group to check the plan in a minute.",
      );
    }
    proposalIds.push(proposalId);
    return JSON.stringify({ proposalId, status: "pending" });
  }

  async function run(name: string, input: unknown): Promise<string> {
    switch (name) {
      case "search_activities": {
        const { query } = parseInput(SearchActivitiesInput, input);
        return wrapUntrusted("web_search", await ports.searchActivities(query));
      }
      case "list_merchants":
        parseInput(NoInput, input);
        return wrapUntrusted("merchant_catalog", await ports.listMerchants());
      case "get_quote": {
        const request = parseInput(GetQuoteInput, input);
        const quote = Quote.parse(await ports.getQuote(request));
        if (quote.itemId !== request.itemId || quote.quantity !== request.quantity) {
          throw new ToolRejection("The merchant quoted a different item. Try again.");
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
        const { name: tripName, endsAt, members } = Trip.parse(await ports.getTripState(tripId));
        return wrapUntrusted("trip_state", { name: tripName, endsAt, members });
      }
      case "propose_purchase":
        return proposePurchase(input);
      case "update_itinerary": {
        const { items } = parseInput(UpdateItineraryInput, input);
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
        // Service and validation failures stay out of the model's context; the code is logged.
        logger.error("AGENT_TOOL_FAILED");
        return { content: `${name} is unavailable right now.`, isError: true };
      }
    },
  };
}
