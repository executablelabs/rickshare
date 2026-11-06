import { describe, expect, test } from "bun:test";
import {
  createOpenRouterModel,
  fromChatCompletion,
  OPENROUTER_CHAT_URL,
  toChatRequest,
} from "./openrouter";
import { DEFAULT_AGENT_MODEL, type ModelRequest, ModelUnavailableError } from "./service";
import { agentTools } from "./tools";

const request: ModelRequest = {
  model: DEFAULT_AGENT_MODEL,
  max_tokens: 1000,
  system: [
    { type: "text", text: "You plan trips." },
    { type: "text", text: "Current UTC time: 2026-12-01T00:00:00.000Z" },
  ],
  tools: agentTools,
  output_config: { effort: "medium" },
  messages: [
    { role: "user", content: '{"from":"0xA","text":"Ideas for Goa?"}' },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me look." },
        {
          type: "tool_use",
          id: "call_1",
          name: "search_activities",
          input: { query: "Goa" },
          caller: { type: "direct" },
        },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call_1", content: "No results", is_error: true },
      ],
    },
  ],
};

const completion = (message: object, finish_reason: string | null = "stop") => ({
  id: "gen-1",
  choices: [{ index: 0, finish_reason, message: { role: "assistant", ...message } }],
});

describe("requests", () => {
  test("translate the conversation into chat messages", () => {
    expect(toChatRequest(request).messages).toEqual([
      {
        role: "system",
        content: "You plan trips.\n\nCurrent UTC time: 2026-12-01T00:00:00.000Z",
      },
      { role: "user", content: '{"from":"0xA","text":"Ideas for Goa?"}' },
      {
        role: "assistant",
        content: "Let me look.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "search_activities", arguments: '{"query":"Goa"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "Tool error: No results" },
    ]);
  });

  test("keep every tool strict, carry effort, and route only to providers that support tools", () => {
    const chat = toChatRequest(request);
    expect(chat.tools).toHaveLength(agentTools.length);
    expect(chat.tools.every((tool) => tool.function.strict === true)).toBe(true);
    expect(chat.tools[0]?.function.parameters).toEqual(agentTools[0]?.input_schema);
    expect(chat).toMatchObject({
      model: DEFAULT_AGENT_MODEL,
      max_tokens: 1000,
      reasoning: { effort: "medium" },
      provider: { require_parameters: true },
    });
  });
});

describe("responses", () => {
  test("turn tool calls into tool_use blocks, even when the provider says stop", () => {
    const response = fromChatCompletion(
      completion({
        content: "Checking.",
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "get_trip_state", arguments: "{}" },
          },
        ],
      }),
    );
    expect(response.stop_reason).toBe("tool_use");
    expect(response.content).toEqual([
      { type: "text", text: "Checking.", citations: null },
      { type: "tool_use", id: "c2", name: "get_trip_state", input: {}, caller: { type: "direct" } },
    ]);
  });

  test("pass invalid tool JSON through as text so the tool's schema check rejects it", () => {
    const response = fromChatCompletion(
      completion(
        {
          content: null,
          tool_calls: [
            { id: "c3", type: "function", function: { name: "get_quote", arguments: "{oops" } },
          ],
        },
        "tool_calls",
      ),
    );
    expect(response.content).toEqual([
      { type: "tool_use", id: "c3", name: "get_quote", input: "{oops", caller: { type: "direct" } },
    ]);
  });

  test.each([
    ["stop", {}, "end_turn"],
    ["length", {}, "max_tokens"],
    ["content_filter", {}, "refusal"],
    ["stop", { refusal: "I can't help with that." }, "refusal"],
  ])("map finish %s to %s-style stops", (finish, extra, expected) => {
    expect(fromChatCompletion(completion({ content: "Hi", ...extra }, finish)).stop_reason).toBe(
      expected as "end_turn",
    );
  });

  test("reject a body without choices, such as an error payload", () => {
    expect(() => fromChatCompletion({ error: { code: 402, message: "No credits" } })).toThrow(
      ModelUnavailableError,
    );
  });
});

describe("transport", () => {
  test("posts to OpenRouter with the key as a bearer token", async () => {
    const seen: Request[] = [];
    const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return Response.json(completion({ content: "Hello" }));
    }) as typeof fetch;

    const response = await createOpenRouterModel("sk-or-test", fetchStub).createMessage(request);

    const [sent] = seen;
    expect(sent?.url).toBe(OPENROUTER_CHAT_URL);
    expect(sent?.headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(await sent?.json()).toMatchObject({ model: DEFAULT_AGENT_MODEL });
    expect(response.content).toEqual([{ type: "text", text: "Hello", citations: null }]);
  });

  test.each([
    ["an HTTP error", async () => new Response("busy", { status: 503 }), "HTTP_503"],
    [
      "a network failure",
      async () => {
        throw new TypeError("fetch failed");
      },
      "CONNECTION",
    ],
  ])("reports %s as unavailable", async (_case, fetchStub, code) => {
    const model = createOpenRouterModel("sk-or-test", fetchStub as unknown as typeof fetch);
    await expect(model.createMessage(request)).rejects.toMatchObject({ code });
  });
});
