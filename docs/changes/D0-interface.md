# D0 (interface): brand mark and splash motion

## Summary

DESIGN.md gains a Brand section for the new rickshaw mark, and its Motion section now allows two things: a once-per-session splash and a rickshaw loading state. Before this change, nothing could animate on page load and marigold was reserved for "Waiting for you". The web PR for D0 depends on this change.

## Files

- docs/DESIGN.md: Brand section; marigold also allowed in the mark; splash and loader rules under Motion

## Interfaces touched

docs/DESIGN.md only. No shared types, routes, ABI functions or events.

## Verification

- bun run check: pass
- Manual: reread Motion, Color and "Do not" together. The splash is a full-screen brand moment, not a colored container, and it is skipped under reduced motion.

## Follow-ups

D0 web: logo files, RickshawMark, Loader and Splash.
