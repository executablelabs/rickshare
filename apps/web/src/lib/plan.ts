import { arcTestnet, ChatMessage, Proposal, Ticket, TripEvent } from "@rickshare/shared";
import { tripVaultAbi } from "@rickshare/shared/abi";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { encodeFunctionData, getAddress, type Hex, isHex } from "viem";
import { z } from "zod";
import { api } from "./api";
import { readApi } from "./http";
import { tripKeys } from "./trips";
import type { Attestation } from "./world";

export const planKeys = {
  chat: (tripId: string) => ["trips", tripId, "chat"] as const,
  proposals: (tripId: string) => ["trips", tripId, "proposals"] as const,
};

const CHAT_LIMIT = 40;

export function useChat(tripId: string) {
  return useQuery({
    queryKey: planKeys.chat(tripId),
    queryFn: async () =>
      (
        await readApi(
          await api.trips[":tripId"].chat.$get({
            param: { tripId },
            query: { limit: String(CHAT_LIMIT) },
          }),
          z.object({ messages: z.array(ChatMessage) }),
        )
      ).messages,
  });
}

export function useProposals(tripId: string) {
  return useQuery({
    queryKey: planKeys.proposals(tripId),
    queryFn: async () =>
      (
        await readApi(
          await api.trips[":tripId"].proposals.$get({ param: { tripId } }),
          z.object({ proposals: z.array(Proposal) }),
        )
      ).proposals,
  });
}

/** Adds or replaces messages by id, and drops an optimistic copy once the real one arrives. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (message.clientRequestId)
      for (const [id, existing] of byId)
        if (
          id.startsWith("pending:") &&
          existing.clientRequestId === message.clientRequestId &&
          existing.role === message.role
        )
          byId.delete(id);
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

export function upsertProposal(current: Proposal[] | undefined, proposal: Proposal): Proposal[] {
  const others = (current ?? []).filter((existing) => existing.id !== proposal.id);
  return [...others, proposal].sort((a, b) => Number(a.id) - Number(b.id));
}

const Reply = z.object({ memberMessage: ChatMessage, agentMessage: ChatMessage });
const ChatResult = z.object({
  requestId: z.string(),
  status: z.string(),
  errorCode: z.string().nullable(),
  reply: Reply.nullable(),
});

export async function sendChat(tripId: string, requestId: string, text: string) {
  return readApi(
    await api.trips[":tripId"].chat.$post({ param: { tripId }, json: { requestId, text } }),
    ChatResult,
  );
}

/** Applies one stream event to the cached feed, trip and itinerary. */
export function applyTripEvent(client: QueryClient, tripId: string, event: TripEvent) {
  switch (event.type) {
    case "chat.message":
      client.setQueryData<ChatMessage[]>(planKeys.chat(tripId), (current) =>
        mergeMessages(current ?? [], [event.message]),
      );
      return;
    case "proposal.created":
    case "proposal.updated":
      client.setQueryData<Proposal[]>(planKeys.proposals(tripId), (current) =>
        upsertProposal(current, event.proposal),
      );
      return;
    case "balances.updated":
      void client.invalidateQueries({ queryKey: tripKeys.one(tripId) });
      void client.invalidateQueries({ queryKey: tripKeys.money(tripId) });
      return;
    case "itinerary.updated":
      void client.invalidateQueries({ queryKey: ["trips", tripId, "itinerary"] });
      return;
  }
}

const EVENT_TYPES = TripEvent.options.map((option) => option.shape.type.value);

/**
 * Keeps the feed live over the trip's server-sent events. EventSource resumes with Last-Event-ID
 * by itself after a drop, so no event is missed; the server checks the session on every frame.
 */
export function useTripStream(tripId: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(api.trips[":tripId"].stream.$url({ param: { tripId } }), {
      withCredentials: true,
    });
    const onEvent = (frame: MessageEvent<string>) => {
      try {
        const parsed = TripEvent.safeParse(JSON.parse(frame.data));
        if (!parsed.success) throw new Error("Invalid trip event");
        applyTripEvent(client, tripId, parsed.data);
      } catch {
        void client.invalidateQueries({ queryKey: planKeys.chat(tripId) });
        void client.invalidateQueries({ queryKey: planKeys.proposals(tripId) });
      }
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, onEvent);
    return () => source.close();
  }, [client, tripId]);
}

/** The vault call that records a World-attested approval of the member's own share. */
export function approveCall(
  vaultAddress: string,
  attestation: Attestation,
  expected: { proposalId: string; member: string; amount: string; deadline: string },
): { from: `0x${string}`; to: `0x${string}`; data: Hex } {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (
    !isHex(attestation.signature) ||
    attestation.signature.length !== 132 ||
    attestation.chainId !== arcTestnet.id ||
    attestation.vaultAddress.toLowerCase() !== vaultAddress.toLowerCase() ||
    attestation.proposalId !== expected.proposalId ||
    attestation.member.toLowerCase() !== expected.member.toLowerCase() ||
    attestation.amount !== expected.amount
  )
    throw new Error("The approval does not match this share. Refresh the plan and try again.");
  if (
    BigInt(attestation.deadline) <= now ||
    BigInt(attestation.deadline) > now + 900n ||
    BigInt(attestation.deadline) > BigInt(Math.floor(Date.parse(expected.deadline) / 1000))
  )
    throw new Error(
      "Your verification expired or its deadline is invalid. Approve again to retry.",
    );
  return {
    from: getAddress(expected.member),
    to: getAddress(vaultAddress),
    data: encodeFunctionData({
      abi: tripVaultAbi,
      functionName: "approve",
      args: [
        BigInt(attestation.proposalId),
        BigInt(attestation.nonce),
        BigInt(attestation.deadline),
        attestation.signature,
      ],
    }),
  };
}

export async function fetchTicket(tripId: string, proposalId: string) {
  return readApi(
    await api.trips[":tripId"].proposals[":proposalId"].ticket.$get({
      param: { tripId, proposalId },
    }),
    Ticket,
  );
}
