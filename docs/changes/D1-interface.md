# D1 (interface): coral and navy palette

## Summary

The coral and navy direction is chosen. DESIGN.md now defines its tokens:

- navy (`--ink`) frames the app
- coral marks primary actions
- tints with their own inks carry status and member identity
- one soft card shadow

Coral is darkened from the mockup's #D9472F to #CC4127 so white button text passes AA (4.8:1). `--declined` moves to crimson so it never reads as the coral primary.

## Files

- docs/DESIGN.md: Concept, Color, Layout, Components and "Do not" updated for the palette

## Interfaces touched

docs/DESIGN.md only.

## Verification

- bun run check: pass
- Contrast was computed for every tint and ink pair (all at least 5:1), white on coral (4.8:1) and the focus ring on navy (3.1:1, non-text).

## Follow-ups

D2 tokens and primitives, D3 app shell.
