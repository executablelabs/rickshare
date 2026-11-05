import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "@kitty/shared";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { ChatStore } from "../chat/service";
import { SYSTEM_PROMPT } from "./prompt";
import { type AgentPorts, agentTools, createToolRun } from "./tools";

export const AGENT_MODEL = "claude-opus-5-5";
const MAX_OUTPUT_TOKENS = 16_000;
export const MAX_TOOL_ROUNDS = 10;
const HISTORY_LIMIT = 40;

export const AGENT_REPLIES = {
  refused: "I can't help with that request. Try asking in a different way.",
  unfinished: "I couldn't finish planning that. Try asking again with a few more details.",
};

type ModelRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type ModelResponse = Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason">;

/** The one model call the agent makes; tests replace it with a scripted model. */
export interface AgentModel {
  createMessage(request: ModelRequest): Promise<ModelResponse>;
}

export function createClaudeModel(client: Anthropic): AgentModel {
  return { createMessage: (request) => client.beta.messages.create(request) };
}

function toModelMessages(history: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
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
  ports: AgentPorts;
  chat: ChatStore;
  now?: () => Date;
}

export function createAgentService({
  model,
  ports,
  chat,
  now = () => new Date(),
}: AgentDependencies) {
  async function callModel(messages: Anthropic.Beta.BetaMessageParam[]): Promise<ModelResponse> {
    try {
      return await model.createMessage({
        model: AGENT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        tools: agentTools,
        messages,
        output_config: { effort: "medium" },
        // System prompt and tools are identical on every call, so they cache well.
        cache_control: { type: "ephemeral" },
        // On a safety decline, the API retries on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        logger.error(`AGENT_MODEL_FAILED.${error.status ?? "CONNECTION"}`);
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
    const tools = createToolRun(tripId, ports, now, chat.agentProposalIds(tripId));
    const finish = (text: string) => ({ text, proposalIds: [...tools.proposalIds] });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callModel(messages);
      if (response.stop_reason === "refusal") return finish(AGENT_REPLIES.refused);
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      const toolCalls = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
      );
      // Only a complete tool_use turn runs tools; a max_tokens stop may hold a cut-off call.
      if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
        return finish(textOf(response) || AGENT_REPLIES.unfinished);
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
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
    async reply(request: { tripId: string; author: string; text: string }) {
      const memberMessage = chat.append({
        tripId: request.tripId,
        role: "member",
        author: request.author,
        text: request.text,
        proposalIds: [],
      });
      return oneTurnAtATime(request.tripId, async () => {
        const history = chat.listRecent(request.tripId, HISTORY_LIMIT);
        const { text, proposalIds } = await plan(request.tripId, history);
        const agentMessage = chat.append({
          tripId: request.tripId,
          role: "agent",
          author: null,
          text,
          proposalIds,
        });
        return { memberMessage, agentMessage };
      });
    },
  };
}
