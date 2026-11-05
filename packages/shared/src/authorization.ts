import { getAddress, type Hex, keccak256, stringToHex } from "viem";
import { z } from "zod";
import { Address, Hex as HexSchema, Quote } from "./schemas";

export const SignedQuote = Quote.extend({
  quoteId: z.string().min(1).max(128),
  itemId: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  location: z.string().min(1).max(160),
  vaultAddress: Address,
  chainId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(32),
  quoteHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  signature: HexSchema.refine((value) => value.length >= 130 && value.length <= 8194),
});
export type SignedQuote = z.infer<typeof SignedQuote>;
export type QuoteTerms = Omit<SignedQuote, "quoteHash" | "signature">;

export const quoteTypes = {
  Quote: [
    { name: "quoteId", type: "bytes32" },
    { name: "itemId", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "title", type: "string" },
    { name: "location", type: "string" },
    { name: "unitPrice", type: "uint256" },
    { name: "quantity", type: "uint256" },
    { name: "total", type: "uint256" },
    { name: "startsAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export const approvalTypes = {
  Approval: [
    { name: "proposalId", type: "uint256" },
    { name: "member", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const inviteTypes = {
  Invite: [
    { name: "member", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function vaultDomain(chainId: number, vaultAddress: string) {
  return {
    name: "Rickshare TripVault",
    version: "1",
    chainId,
    verifyingContract: getAddress(vaultAddress),
  } as const;
}

export function contractQuote(quote: QuoteTerms) {
  return {
    quoteId: keccak256(stringToHex(quote.quoteId)),
    itemId: keccak256(stringToHex(quote.itemId)),
    merchant: getAddress(quote.merchant),
    title: quote.title,
    location: quote.location,
    unitPrice: BigInt(quote.unitPrice),
    quantity: BigInt(quote.quantity),
    total: BigInt(quote.total),
    startsAt: BigInt(Math.floor(Date.parse(quote.startsAt) / 1000)),
    expiresAt: BigInt(Math.floor(Date.parse(quote.expiresAt) / 1000)),
  };
}

export function quoteTypedData(quote: QuoteTerms) {
  return {
    domain: vaultDomain(quote.chainId, quote.vaultAddress),
    types: quoteTypes,
    primaryType: "Quote",
    message: contractQuote(quote),
  } as const;
}

export function approvalTypedData(input: {
  chainId: number;
  vaultAddress: string;
  proposalId: bigint;
  member: string;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: vaultDomain(input.chainId, input.vaultAddress),
    types: approvalTypes,
    primaryType: "Approval",
    message: {
      proposalId: input.proposalId,
      member: getAddress(input.member),
      amount: input.amount,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  } as const;
}

export function inviteTypedData(input: {
  chainId: number;
  vaultAddress: string;
  member: string;
  deadline: bigint;
}) {
  return {
    domain: vaultDomain(input.chainId, input.vaultAddress),
    types: inviteTypes,
    primaryType: "Invite",
    message: { member: getAddress(input.member), deadline: input.deadline },
  } as const;
}

export function asHex(value: string): Hex {
  return HexSchema.refine((input) => input.length % 2 === 0).parse(value) as Hex;
}
