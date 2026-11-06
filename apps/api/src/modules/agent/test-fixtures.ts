// Test-only fixtures for the agent module; nothing in src imports this outside *.test.ts.
import type { Member, SignedQuote, Trip } from "@rickshare/shared";
import type { ItineraryDraft } from "../trips/itinerary";
import type { AgentPorts } from "./tools";

export const NOW = new Date("2026-12-10T08:00:00.000Z");

export const ANGIE = "0x00000000000000000000000000000000000000a1";
export const BASHY = "0x00000000000000000000000000000000000000b2";
export const GITAU = "0x00000000000000000000000000000000000000c3";
export const ALLOWLISTED_MERCHANT = "0x1111111111111111111111111111111111111111";

function member(address: string, displayName: string): Member {
  return {
    address,
    displayName,
    ensName: null,
    worldLinked: true,
    policy: { autoApproveMax: "20000000", totalCap: "300000000" },
    deposited: "200000000",
    spent: "0",
    locked: "0",
    available: "200000000",
  };
}

export const TRIP: Trip = {
  id: "india26",
  name: "India 26",
  ensName: null,
  vaultAddress: "0x2222222222222222222222222222222222222222",
  endsAt: "2026-12-20T00:00:00.000Z",
  members: [member(ANGIE, "Angie"), member(BASHY, "Bashy"), member(GITAU, "Gitau")],
};

export function paraglidingQuote(overrides: Partial<SignedQuote> = {}): SignedQuote {
  return {
    quoteId: "q-paragliding",
    merchant: ALLOWLISTED_MERCHANT,
    itemId: "arambol-paragliding",
    title: "Tandem paragliding in Arambol",
    unitPrice: "42000000",
    quantity: 2,
    total: "84000000",
    startsAt: "2026-12-14T10:00:00.000Z",
    expiresAt: "2026-12-10T08:10:00.000Z",
    location: "Arambol, Goa",
    vaultAddress: TRIP.vaultAddress,
    chainId: 5042002,
    quoteHash: `0x${"ab".repeat(32)}`,
    signature: `0x${"12".repeat(65)}`,
    ...overrides,
  };
}

export function createFakePorts(overrides: Partial<AgentPorts> = {}) {
  const submitted: Parameters<AgentPorts["submitProposal"]>[0][] = [];
  const itineraries: ItineraryDraft[][] = [];
  const ports: AgentPorts = {
    searchActivities: async () => [],
    listMerchants: async () => [
      {
        id: "goa-adventures",
        name: "Goa Adventures",
        address: ALLOWLISTED_MERCHANT,
        items: [
          {
            id: "arambol-paragliding",
            title: "Tandem paragliding in Arambol",
            location: "Goa",
            unitPrice: "42000000",
          },
        ],
      },
    ],
    getQuote: async () => paraglidingQuote(),
    getTripState: async () => TRIP,
    submitProposal: async (request) => {
      submitted.push(request);
      return { proposalId: String(submitted.length), status: "pending" };
    },
    replaceItinerary: (_tripId, drafts) => {
      itineraries.push(drafts);
      return drafts.map((draft, index) => ({ ...draft, id: `item-${index}`, ticketUrls: [] }));
    },
    ...overrides,
  };
  return { ports, submitted, itineraries };
}
