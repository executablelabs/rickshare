import type Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "@rickshare/shared";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { ChatStore } from "../chat/service";
import { SYSTEM_PROMPT } from "./prompt";
import { type AgentPorts, agentTools, createToolRun } from "./tools";

/** A cheap OpenRouter model with strict tool calling; OPENROUTER_MODEL overrides it. */
export const DEFAULT_AGENT_MODEL = "openai/gpt-oss-120b";
const MAX_OUTPUT_TOKENS = 16_000;
export const MAX_TOOL_ROUNDS = 10;
const HISTORY_LIMIT = 40;

export const AGENT_REPLIES = {
  refused: "I can't help with that request. Try asking in a different way.",
  unfinished: "I couldn't finish planning that. Try asking again with a few more details.",
};

// The agent loop speaks the Messages API shape; openrouter.ts translates it for any model.
export type ModelRequest = Anthropic.Messages.MessageCreateParamsNonStreaming;
export type ModelResponse = Pick<Anthropic.Messages.Message, "content" | "stop_reason">;

/** The one model call the agent makes; tests replace it with a scripted model. */
export interface AgentModel {
  createMessage(request: ModelRequest): Promise<ModelResponse>;
}

/** The model could not be reached or answered with something unusable. */
export class ModelUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`The agent model is unavailable (${code}).`);
  }
}

function toModelMessages(history: ChatMessage[]): Anthropic.Messages.MessageParam[] {
  // The conversation sent to the model must open with a member's message.
  const firstMemberIndex = history.findIndex((message) => message.role === "member");
  return history.slice(Math.max(firstMemberIndex, 0)).map((message) =>
    message.role === "agent"
      ? { role: "assistant", content: message.text }
      : // JSON keeps the sender out of reach of the text: a header typed inside `text`
        // stays a quoted string and cannot pose as another member's message.
        { role: "user", content: JSON.stringify({ from: message.author, text: message.text }) },
  );
}

function textOf(response: ModelResponse): string {
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text.trim()] : []))
    .filter(Boolean)
    .join("\n\n");
}

export interface AgentDependencies {
  model: AgentModel;
  ports: AgentPorts | ((tripId: string) => AgentPorts);
  chat: ChatStore;
  /** An OpenRouter model id; it must be a Claude model, since the Messages API serves only those. */
  modelId?: string;
  now?: () => Date;
}

export function createAgentService({
  model,
  ports,
  chat,
  modelId = DEFAULT_AGENT_MODEL,
  now = () => new Date(),
}: AgentDependencies) {
  async function callModel(
    messages: Anthropic.Messages.MessageParam[],
    tripContext: string,
  ): Promise<ModelResponse> {
    try {
      return await model.createMessage({
        model: modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          // Static prompt first, clock last: providers cache the longest unchanged prefix.
          { type: "text", text: SYSTEM_PROMPT },
          { type: "text", text: `Saved trip context for this turn:\n${tripContext}` },
          { type: "text", text: `Current UTC time: ${now().toISOString()}` },
        ],
        tools: agentTools,
        messages,
        output_config: { effort: "medium" },
      });
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        logger.error(`AGENT_MODEL_FAILED.${error.code}`);
        throw new AppError(
          "AGENT_UNAVAILABLE",
          "The trip agent is unavailable right now. Try again in a moment.",
          503,
        );
      }
      throw error;
    }
  }

  async function plan(tripId: string, history: ChatMessage[]) {
    const messages = toModelMessages(history);
    const tools = createToolRun(
      tripId,
      typeof ports === "function" ? ports(tripId) : ports,
      now,
      chat.agentProposalIds(tripId),
    );
    const finish = (text: string) => ({ text, proposalIds: [...tools.proposalIds] });
    // Resolve references such as "there" even when the model does not request a tool.
    const tripContext = await tools.execute("get_trip_state", {});

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callModel(messages, tripContext.content);
      if (response.stop_reason === "refusal") return finish(AGENT_REPLIES.refused);
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      const toolCalls = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
      );
      // Only a complete tool_use turn runs tools; a max_tokens stop may hold a cut-off call.
      if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
        return finish(textOf(response) || AGENT_REPLIES.unfinished);
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      // Sequential, so a quote fetched earlier in the same response is usable by a later call.
      for (const call of toolCalls) {
        const outcome = await tools.execute(call.name, call.input);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }
      messages.push({ role: "user", content: results });
    }
    return finish(AGENT_REPLIES.unfinished);
  }

  // One agent turn per trip at a time, so two members asking at once cannot both propose the
  // same purchase; the later turn sees the earlier reply. This lock is per process.
  const tripTurns = new Map<string, Promise<void>>();

  function oneTurnAtATime<T>(tripId: string, turn: () => Promise<T>): Promise<T> {
    const previous = tripTurns.get(tripId) ?? Promise.resolve();
    const result = previous.then(turn);
    // Only completion is tracked here; the caller still receives the turn's own error.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    tripTurns.set(tripId, settled);
    void settled.then(() => {
      if (tripTurns.get(tripId) === settled) tripTurns.delete(tripId);
    });
    return result;
  }

  return {
    /** Saves a member's message, lets the agent work, and saves and returns its reply. */
    async reply(request: { tripId: string; author: string; text: string; requestId?: string }) {
      return oneTurnAtATime(request.tripId, async () => {
        const memberMessage = chat.append({
          tripId: request.tripId,
          role: "member",
          author: request.author,
          text: request.text,
          proposalIds: [],
          ...(request.requestId ? { clientRequestId: request.requestId } : {}),
        });
        const history = chat.listRecent(request.tripId, HISTORY_LIMIT);
        const { text, proposalIds } = await plan(request.tripId, history);
        const agentMessage = chat.append({
          tripId: request.tripId,
          role: "agent",
          author: null,
          text,
          proposalIds,
          ...(request.requestId ? { clientRequestId: request.requestId } : {}),
        });
        return { memberMessage, agentMessage };
      });
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
