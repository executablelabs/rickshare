import { ChatMessage } from "@rickshare/shared";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { chatMessages } from "../../db/schema";
import { logger } from "../../lib/logger";
import { saveTripEvent } from "../indexer/events";
import type { TripEventEnvelope } from "../indexer/types";

export type NewChatMessage = Omit<ChatMessage, "id" | "createdAt">;

type ChatRow = typeof chatMessages.$inferSelect;

function toChatMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    ...(row.clientRequestId ? { clientRequestId: row.clientRequestId } : {}),
    tripId: row.tripId,
    role: row.role,
    author: row.author,
    text: row.text,
    proposalIds: row.proposalIds,
    createdAt: row.createdAt,
  };
}

export function createChatStore(
  db: AppDatabase,
  now: () => Date = () => new Date(),
  publish?: (event: TripEventEnvelope) => void,
) {
  return {
    append(message: NewChatMessage): ChatMessage {
      const committed = db.transaction((transaction) => {
        const row = transaction
          .insert(chatMessages)
          .values({ ...message, id: Bun.randomUUIDv7(), createdAt: now().toISOString() })
          .returning()
          .get();
        const saved = ChatMessage.parse(toChatMessage(row));
        return {
          message: saved,
          event: saveTripEvent(transaction, saved.tripId, { type: "chat.message", message: saved }),
        };
      });
      try {
        publish?.(committed.event);
      } catch {
        logger.error("CHAT_EVENT_PUBLISH_PENDING");
      }
      return committed.message;
    },

    /** Every proposal id the agent has announced in this trip's chat. */
    agentProposalIds(tripId: string): string[] {
      return db
        .select({ proposalIds: chatMessages.proposalIds })
        .from(chatMessages)
        .where(and(eq(chatMessages.tripId, tripId), eq(chatMessages.role, "agent")))
        .all()
        .flatMap((row) => row.proposalIds);
    },

    /** The latest `limit` messages of a trip, oldest first. */
    listRecent(tripId: string, limit: number): ChatMessage[] {
      return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.tripId, tripId))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(limit)
        .all()
        .reverse()
        .map(toChatMessage);
    },
  };
}

export type ChatStore = ReturnType<typeof createChatStore>;
