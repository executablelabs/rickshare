# Integration: serialize message intake with agent turns

## Summary

Queue a member message together with its planning turn. Previously a second
concurrent message was persisted before the first queued turn read history, so
the first turn could react to both requests and the second turn would react to
the later request again. Other trips still run independently.

## Verification

A regression with two simultaneous same-trip requests failed before the change:
the first model request contained both user messages. It now contains only its
own request, and the later turn sees the prior assistant reply before the new
member message. Existing concurrent-trip and failed-turn recovery tests pass.
