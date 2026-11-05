import type { ChatMessage } from "@rickshare/shared";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { chatMessages } from "../../db/schema";

export type NewChatMessage = Omit<ChatMessage, "id" | "createdAt">;

type ChatRow = typeof chatMessages.$inferSelect;

function toChatMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    tripId: row.tripId,
    role: row.role,
    author: row.author,
    text: row.text,
    proposalIds: row.proposalIds,
    createdAt: row.createdAt,
  };
}

export function createChatStore(db: AppDatabase, now: () => Date = () => new Date()) {
  return {
    append(message: NewChatMessage): ChatMessage {
      const row = db
        .insert(chatMessages)
        .values({ ...message, id: Bun.randomUUIDv7(), createdAt: now().toISOString() })
        .returning()
        .get();
      return toChatMessage(row);
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
