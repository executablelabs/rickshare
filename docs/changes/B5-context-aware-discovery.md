# B5: context-aware activity discovery

## Summary

Every planner turn now loads saved trip context before the first model call, including destination and start date when present. Discovery instructions prioritize destination-aware web search, source-backed recommendations and clarification when the destination is unknown, while keeping the limited merchant catalog for booking. Search configuration failures are reported explicitly, and recommendations must not invent prices, times, qualifications or availability.

## Files

- apps/api/src/modules/agent/schemas.ts: validate optional planning metadata while supporting older trips.
- apps/api/src/modules/agent/tools.ts: expose destination and date bounds, clarify discovery and booking tools, and report unconfigured search.
- apps/api/src/modules/agent/service.ts: inject fresh, escaped trip context before every planning turn.
- apps/api/src/modules/agent/prompt.ts: resolve trip references, search for recommendations, cite sources and distinguish booking support.
- apps/api/src/modules/agent/service.test.ts: regressions for initial context, refreshes, missing fields, escaping and failed context lookups.
- apps/api/src/modules/agent/tools.test.ts: planning-field validation and missing, failed and empty search behavior.

## Interfaces touched

The internal get_trip_state result adds nullable location and startsAt fields. Their names and validation match the trip metadata work on interface/trip-dates-location; the planner accepts older trips without these fields. No HTTP routes, shared schemas, database tables or environment variables changed.

## Verification

- Targeted agent tests: 63 passed.
- Repository lint and all typechecks: passed with `mise exec node@24.18.0 foundry@1.5.1 -- bun run check`.
- API: 166 passed; shared: 18 passed; merchants: 6 passed; contracts: 98 passed.
- The full check's web run hit five load-related timeout/cascading failures. The complete web suite then passed all 185 tests with `mise exec node@24.18.0 -- bun run test --maxWorkers=2` from apps/web; assertions and timeouts were unchanged.
- LLM and search tests use stubs; live model behavior and the deployed Tavily configuration have not been exercised.

## Follow-ups

- Integrate the parallel trip metadata work so saved location and startsAt reach the trip reader. Until then, destination can be supplied in chat; otherwise the planner is instructed to ask for it.
- Verify the deployed backend has TAVILY_API_KEY configured and smoke-test the original vague activity question against a trip with a saved destination and date range.
- Full-suite web concurrency remains sensitive to local machine load.
