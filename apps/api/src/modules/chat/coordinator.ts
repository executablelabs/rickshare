import { randomUUID } from "node:crypto";
import { ChatMessage } from "@rickshare/shared";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import { chatRequests } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { AgentService } from "../agent/service";

const Reply = z.object({ memberMessage: ChatMessage, agentMessage: ChatMessage });

export class ChatCoordinator {
  private readonly runId = randomUUID();
  constructor(
    private readonly db: AppDatabase,
    private readonly agent: AgentService,
  ) {
    db.update(chatRequests)
      .set({ status: "interrupted", errorCode: "AGENT_TURN_INTERRUPTED" })
      .where(and(eq(chatRequests.status, "processing"), ne(chatRequests.runId, this.runId)))
      .run();
  }

  async post(tripId: string, actor: string, input: { requestId: string; text: string }) {
    const id = `${tripId.toLowerCase()}:${input.requestId}`;
    const existing = this.db.select().from(chatRequests).where(eq(chatRequests.id, id)).get();
    if (existing) {
      if (existing.actor !== actor.toLowerCase())
        throw new AppError(
          "CHAT_REQUEST_OWNERSHIP",
          "This message request ID belongs to another member.",
          403,
        );
      if (existing.text !== input.text)
        throw new AppError(
          "CHAT_REQUEST_CONFLICT",
          "This message request ID was already used for different text.",
          409,
        );
      return {
        requestId: input.requestId,
        status: existing.status,
        errorCode: existing.errorCode,
        reply: existing.result ? Reply.parse(JSON.parse(existing.result)) : null,
      };
    }
    this.db
      .insert(chatRequests)
      .values({
        id,
        tripId: tripId.toLowerCase(),
        actor: actor.toLowerCase(),
        requestId: input.requestId,
        text: input.text,
        status: "processing",
        runId: this.runId,
      })
      .run();
    try {
      const request = {
        tripId: tripId.toLowerCase(),
        author: actor,
        text: input.text,
        requestId: input.requestId,
      };
      const result = await this.agent.reply(request);
      const reply = Reply.parse(result);
      this.db
        .update(chatRequests)
        .set({ status: "complete", result: JSON.stringify(reply) })
        .where(
          and(
            eq(chatRequests.id, id),
            eq(chatRequests.runId, this.runId),
            eq(chatRequests.status, "processing"),
          ),
        )
        .run();
      return { requestId: input.requestId, status: "complete", errorCode: null, reply };
    } catch (error) {
      this.db
        .update(chatRequests)
        .set({
          status: "failed",
          errorCode: error instanceof AppError ? error.code : "AGENT_TURN_FAILED",
        })
        .where(
          and(
            eq(chatRequests.id, id),
            eq(chatRequests.runId, this.runId),
            eq(chatRequests.status, "processing"),
          ),
        )
        .run();
      throw error;
    }
  }
}
