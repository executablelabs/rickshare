# B5: trip agent through OpenRouter

## Summary

The trip agent now calls OpenRouter instead of the Anthropic API, so it runs on the OpenRouter credits. The agent loop keeps its Messages-shaped requests, and a small adapter translates them to OpenRouter's OpenAI-compatible chat completions. That way any model with tool calling works. The default is `openai/gpt-oss-120b` (about $0.03 in and $0.10 out per million tokens), and `OPENROUTER_MODEL` switches models without a code change.

## Files

- apps/api/src/modules/agent/openrouter.ts: request and response translation, transport, typed unavailable errors
- apps/api/src/modules/agent/openrouter.test.ts: new
- apps/api/src/modules/agent/service.ts: transport-neutral, model id injectable, `ModelUnavailableError`
- apps/api/src/modules/agent/tools.ts, service.test.ts, src/integration/flow.test.ts: non-beta types
- apps/api/src/runtime.ts, src/config.ts, .env.example: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`; `ANTHROPIC_API_KEY` removed
- README.md, docs/API.md: env names

## Interfaces touched

- Env: `ANTHROPIC_API_KEY` is replaced by `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL` is new and optional.
- No routes, shared types, ABI functions or events change.

## Verification

- bun run check: pass (api 122, web 59, contracts 98)
- The adapter is tested for message and tool-call translation, strict tools, effort, provider routing, finish-reason mapping, invalid tool JSON, error bodies, HTTP and network failures, and bearer auth.
- Security: payees still come only from signed merchant quotes checked in the tools. A model's tool arguments are validated with zod as before, and invalid JSON reaches that check as text.

## Follow-ups

- `@anthropic-ai/sdk` is now used for types only and could be replaced by local types.
