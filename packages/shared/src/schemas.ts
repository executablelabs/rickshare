import { z } from "zod";

export const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const Hex = z.string().regex(/^0x[a-fA-F0-9]*$/);
export const UsdcAmount = z.string().regex(/^\d+$/);
export const IsoDate = z.string().datetime();

export const Policy = z.object({ autoApproveMax: UsdcAmount, totalCap: UsdcAmount });

export const Member = z.object({
  address: Address,
  displayName: z.string().min(1).max(32),
  ensName: z.string().nullable(),
  worldLinked: z.boolean(),
  policy: Policy,
  deposited: UsdcAmount,
  spent: UsdcAmount,
  locked: UsdcAmount,
  available: UsdcAmount,
});

export const Trip = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  ensName: z.string().nullable(),
  vaultAddress: Address,
  // Older on-chain trips may not have planning metadata.
  startsAt: IsoDate.nullable().optional(),
  endsAt: IsoDate,
  location: z.string().trim().max(160).nullable().optional(),
  members: z.array(Member),
});

export const ProposalStatus = z.enum(["pending", "locked", "fulfilled", "refunded", "rejected"]);
export const ShareState = z.enum(["auto", "approved", "waiting", "rejected"]);

export const Proposal = z.object({
  id: z.string(),
  tripId: z.string(),
  merchant: Address,
  merchantName: z.string(),
  title: z.string(),
  location: z.string(),
  startsAt: IsoDate,
  total: UsdcAmount,
  shares: z.array(z.object({ member: Address, amount: UsdcAmount, state: ShareState })),
  status: ProposalStatus,
  deadline: IsoDate,
  // Older projections may not yet carry the signed quote's stricter approval cutoff.
  quoteExpiresAt: IsoDate.optional(),
  ticketHash: Hex.nullable(),
  txHash: Hex,
});

export const Quote = z.object({
  quoteId: z.string(),
  merchant: Address,
  itemId: z.string(),
  title: z.string(),
  unitPrice: UsdcAmount,
  quantity: z.number().int().positive(),
  total: UsdcAmount,
  startsAt: IsoDate,
  expiresAt: IsoDate,
  quoteHash: Hex,
  signature: Hex,
});

export const Ticket = z.object({
  proposalId: z.string(),
  code: z.string(),
  url: z.string().url(),
  holders: z.array(Address),
});

export const ItineraryItem = z.object({
  id: z.string(),
  startsAt: IsoDate,
  title: z.string(),
  location: z.string(),
  proposalId: z.string().nullable(),
  ticketUrls: z.array(z.string().url()),
});

export const ChatMessage = z.object({
  id: z.string(),
  clientRequestId: z.string().uuid().optional(),
  tripId: z.string(),
  role: z.enum(["member", "agent"]),
  author: Address.nullable(),
  text: z.string(),
  proposalIds: z.array(z.string()),
  createdAt: IsoDate,
});

export const TripEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal.created"), proposal: Proposal }),
  z.object({ type: z.literal("proposal.updated"), proposal: Proposal }),
  z.object({ type: z.literal("chat.message"), message: ChatMessage }),
  z.object({ type: z.literal("balances.updated"), members: z.array(Member) }),
  z.object({ type: z.literal("itinerary.updated"), items: z.array(ItineraryItem) }),
]);

export type Policy = z.infer<typeof Policy>;
export type Member = z.infer<typeof Member>;
export type Trip = z.infer<typeof Trip>;
export type Proposal = z.infer<typeof Proposal>;
export type Quote = z.infer<typeof Quote>;
export type Ticket = z.infer<typeof Ticket>;
export type ItineraryItem = z.infer<typeof ItineraryItem>;
export type ChatMessage = z.infer<typeof ChatMessage>;
export type TripEvent = z.infer<typeof TripEvent>;
