import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  type AgentModel,
  type ModelRequest,
  type ModelResponse,
  ModelUnavailableError,
} from "./service";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 120_000;

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// Only the fields the agent reads are checked; anything else OpenRouter adds is ignored.
const ChatCompletion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
});

function textOf(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .flatMap((block) => (block.type === "text" && block.text ? [block.text] : []))
    .join("\n\n");
}

function toChatMessages(request: ModelRequest): ChatMessage[] {
  const system = typeof request.system === "string" ? request.system : textOf(request.system ?? []);
  const messages: ChatMessage[] = system ? [{ role: "system", content: system }] : [];

  for (const message of request.messages) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const toolCalls = message.content.flatMap((block): ChatToolCall[] =>
        block.type === "tool_use"
          ? [
              {
                id: block.id,
                type: "function",
                function: { name: block.name, arguments: JSON.stringify(block.input) },
              },
            ]
          : [],
      );
      messages.push({
        role: "assistant",
        content: textOf(message.content) || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    for (const block of message.content) {
      if (block.type === "tool_result") {
        const result = textOf(block.content ?? "");
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: block.is_error ? `Tool error: ${result}` : result,
        });
      } else if (block.type === "text") {
        messages.push({ role: "user", content: block.text });
      }
    }
  }
  return messages;
}

function toChatTools(tools: ModelRequest["tools"]) {
  return (tools ?? []).flatMap((tool) =>
    "input_schema" in tool
      ? [
          {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
              ...(tool.strict ? { strict: true } : {}),
            },
          },
        ]
      : [],
  );
}

/** OpenRouter takes low, medium or high; the higher Messages API levels map to high. */
function toReasoningEffort(
  effort: string | null | undefined,
): "low" | "medium" | "high" | undefined {
  if (!effort) return undefined;
  return effort === "low" || effort === "medium" ? effort : "high";
}

export function toChatRequest(request: ModelRequest) {
  const effort = toReasoningEffort(request.output_config?.effort);
  return {
    model: request.model,
    max_tokens: request.max_tokens,
    messages: toChatMessages(request),
    tools: toChatTools(request.tools),
    ...(effort ? { reasoning: { effort } } : {}),
    // Route only to providers that honor every parameter sent, tool calling above all.
    provider: { require_parameters: true },
  };
}

function toStopReason(
  finishReason: string | null,
  hasToolCalls: boolean,
  refused: boolean,
): ModelResponse["stop_reason"] {
  if (refused || finishReason === "content_filter") return "refusal";
  // Some providers report "stop" even when the turn ends in tool calls.
  if (hasToolCalls) return "tool_use";
  return finishReason === "length" ? "max_tokens" : "end_turn";
}

export function fromChatCompletion(body: unknown): ModelResponse {
  const parsed = ChatCompletion.safeParse(body);
  if (!parsed.success) throw new ModelUnavailableError("MALFORMED_RESPONSE");
  const [choice] = parsed.data.choices;
  if (!choice) throw new ModelUnavailableError("MALFORMED_RESPONSE");

  const content: Anthropic.Messages.ContentBlock[] = [];
  const text = choice.message.content?.trim();
  if (text) content.push({ type: "text", text, citations: null });
  for (const call of choice.message.tool_calls ?? []) {
    let input: unknown;
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      // Invalid JSON is passed on as text; the tool's schema check rejects it and tells the model.
      input = call.function.arguments;
    }
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input,
      caller: { type: "direct" },
    });
  }
  const hasToolCalls = content.some((block) => block.type === "tool_use");
  return {
    content,
    stop_reason: toStopReason(choice.finish_reason, hasToolCalls, !!choice.message.refusal),
  };
}

/** Any OpenRouter model with tool calling, through its OpenAI-compatible chat API. */
export function createOpenRouterModel(
  apiKey: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): AgentModel {
  return {
    async createMessage(request) {
      let response: Response;
      try {
        response = await fetch(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "x-title": "Rickshare",
          },
          body: JSON.stringify(toChatRequest(request)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new ModelUnavailableError("CONNECTION");
      }
      if (!response.ok) throw new ModelUnavailableError(`HTTP_${response.status}`);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ModelUnavailableError("MALFORMED_RESPONSE");
      }
      return fromChatCompletion(body);
    },
  };
}
