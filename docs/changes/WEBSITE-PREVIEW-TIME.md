# Website preview: use Goa time on the sample tickets

Both landing-page tickets show the same fixed time in Goa during server rendering
and hydration. The example is not a booking. Real proposals still use the
member's local time, and approval deadlines and payment logic are unchanged.

## Files

- `apps/web/src/components/landing/example-trip.ts` supplies the display label.
- `apps/web/src/components/landing/ProductPreview.tsx` passes it to both previews.
- `apps/web/src/components/plan/ProposalTicket.tsx` accepts an optional display-only label.
- `apps/web/src/components/landing/ProductPreview.test.tsx` asserts both previews use it.

## Verification

The original live release reproduced React error #418 at 390px in the Nairobi
time zone; the UTC control did not. The focused test failed on the old source and
passed with this patch. A UTC loopback server and real Nairobi Chrome reproduced
the old error and passed with identical ticket text after the fix. The rebuilt
standalone site passed loopback browser checks at 360, 390, 768 and 1280px. This
change is not deployed, and full repository and physical-device checks are not
claimed.

## Interfaces touched

Only an optional React component prop. No environment variables, API, Privy,
chain, or member consent change.
