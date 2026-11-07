# B5: give activity suggestions without a questionnaire

## Summary

The planner now uses the saved destination, dates and any stated budget to return a compact first-response shortlist instead of requiring a questionnaire. Each option should show its activity, date window, merchant and per-person price. Missing dates do not block ideas; missing or conflicting destinations still need one concise clarification. Without a stated budget, relevant lower-priced catalog options come first; available funds are never substituted for a spending preference.

## Files

- apps/api/src/modules/agent/prompt.ts: direct shortlist and truthful date guidance

## Interfaces touched

None. Quote validation, booking consent, merchant selection, financial approval limits, contracts and public API schemas remain unchanged.

## Verification

- Full bun run check: pass, 490 existing tests, with VITEST_MAX_WORKERS=2 for local worker contention.
- Existing agent suite: 63 tests and 168 assertions pass, including saved destination/date context, tool validation, consent and merchant binding.
- Prompt review: stated per-person, per-activity and whole-trip budgets remain distinct; fewer than three suggestions are allowed when budget or coverage is limited; missing dates do not block ideas.
- Automatic approval review blocked the live-model smoke command with "blocked by policy" and no further reason. The updated prompt's real-model behavior was not verified by that command.
- No test files added or modified, per the user's explicit instruction.

## Follow-ups

The merchant catalog does not publish available date/time slots. The planner labels the saved trip window as proposed dates and must not claim confirmed availability without a source. Exact dates and participants are still required when creating a purchase.
