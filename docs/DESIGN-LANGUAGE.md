# Rickshare design language

## Scope and direction

This is the agreed visual language for Rickshare, including the signed-out landing and authenticated trip application. It supersedes the earlier visual palette, surface and landing-page restrictions in [DESIGN.md](DESIGN.md). The trip application retains that document's tickets-and-stamps structure, financial status colors and interaction patterns.

The balance is **80% polished SaaS, 20% travel personality**. Rickshare should feel like a modern shared-trip startup: confident type, clear product presentation and generous space, with a few tactile details that recall postcards, luggage stickers and tickets.

The central message remains: friends plan together, and each person controls their own share. Money moves only with that member's approval or within limits that member set.

## Color and contrast

Brand colors live in `apps/web/src/styles/tokens.css`. Marketing aliases remain scoped to `.landing` in `apps/web/src/components/landing/landing.css`, referencing those shared tokens. Reuse these tokens rather than introducing one-off colors into components.

| Token                    | Value     | Role                                                                 |
| ------------------------ | --------- | -------------------------------------------------------------------- |
| `--landing-orange`       | `#F45B35` | Hero and closing section; the signature full-color canvas            |
| `--landing-contrast-ink` | `#1B100C` | Warm near-black/espresso for text on orange                          |
| `--landing-ink`          | `#172341` | Navy on cream, product chrome, primary buttons and the trust section |
| `--landing-cream`        | `#FFF9F2` | Planning section, journey rail, paper details and headline highlight |
| `--landing-white`        | `#FFFFFF` | Product cards and text on navy buttons                               |
| `--landing-sky`          | `#B9DFF5` | Supporting illustration and large emphasis text on navy              |
| `--landing-mint`         | `#BFE8D5` | Reassurance and supporting accents                                   |
| `--landing-yellow`       | `#FFD477` | Restrained sticker and hover accents                                 |
| `--landing-muted`        | `#606579` | Secondary text on light surfaces                                     |
| `--landing-on-dark`      | `#BAC4D6` | Secondary text on navy                                               |
| `--landing-rule`         | `#E6E3DE` | Light-surface dividers and borders                                   |
| `--landing-dark-rule`    | `#39435D` | Dividers and outlines on navy                                        |

Use espresso rather than blue navy for the main copy on orange. The “Pay only your share” line uses espresso on a solid cream highlight; cream text directly on orange was rejected during review for insufficient visual contrast. Keep small disclosures legible rather than fading them with opacity.

The shared product tokens still govern proposal states, approvals, declines and member avatars. Marketing orange is not a substitute for a financial status color. The transport bodies retain the original brand marigold, `--marigold` (`#E9A21B`), rather than the lighter marketing yellow.

## Typography

- **Geist Variable** for body copy, navigation and controls.
- **Bricolage Grotesque Variable** for the wordmark, headings and prominent amounts.
- Use the existing local Fontsource packages; no new font service is required.
- Display headings are weight 600, compact and deliberately large, with tight letter spacing. Supporting hero copy uses weight 500 for better readability on orange.
- The desktop hero uses `--landing-hero-title`, `clamp(52px, 6.25vw, 90px)`; mobile adjusts it to `clamp(50px, 9.3vw, 72px)`.
- Section headings use `--landing-title`, with responsive overrides. Body copy is normally 16–18px; marketing UI labels use the 12/14px tokens.
- Tiny text inside a clearly labelled product illustration is presentation detail, not the place for essential disclosures or instructions.
- Amounts retain tabular numerals and the existing `Amount` component. Money values remain base-unit strings or `bigint` in code.

Keep copy direct and friendly. Avoid hype, jargon and claims of guaranteed bookings or production payments.

## Transport brand family

The original rickshaw is the reference, not an interchangeable transport pictogram. The family is:

1. **Rickshaw** — original side-profile mark, unchanged.
2. **Bus** — rounded side profile, grouped windows, marigold body and navy wheels.
3. **Electric Express** — the selected train design: one streamlined side-profile carriage, overhead electrical wire, roof pantograph, rounded windows and **no visible wheels**.
4. **Plane** — side profile with rounded navy silhouette, marigold fuselage and small windows.

All four share a `64 × 48` viewBox, comparable visual weight, navy/current-color structure, marigold accents and restrained detail. The train's electrical strokes are 2.4 units with round caps and joins. Do not add multiple carriages, exposed train wheels or a front-facing metro as alternate production marks: Electric Express is the agreed direction.

The wordmark stays “Rickshare” in Bricolage Grotesque 600. Only the vehicle changes. The normal app wordmark, splash and loader keep the rickshaw; marketing explicitly opts into the transport family through `Wordmark`'s `vehicle` prop.

Sources:

- `apps/web/src/components/brand/RickshawMark.tsx`: original mark and asset-matching paths.
- `apps/web/src/components/brand/TrainMark.tsx`: canonical Electric Express SVG.
- `apps/web/src/components/brand/TransportMark.tsx`: family composition and crossfade states.
- `apps/web/src/components/brand/transport-mark.css`: fixed footprint and transition rules.
- `apps/web/src/components/brand/Wordmark.tsx`: shared wordmark with opt-in vehicle state.

## Page composition

### 1. Hero — orange / rickshaw

- At least `100svh`, with navigation integrated into the orange canvas.
- Large left-aligned headline: “Plan together. Go further. Pay only your share.”
- Primary Get started action and secondary How it works anchor.
- Product preview on the right at desktop; stacked below the copy on mobile.
- The preview shows an example India ’26 trip and the actual proposal-ticket component, with the individual share and approval action clearly visible.
- Limit travel details to a postcard, small sticker, receipt-like acknowledgement and a quiet route doodle. The product remains the focus.

### 2. Planning — cream / bus

- “The group chat has ideas. Rickshare makes the plan.”
- A large conversation/product showcase beside a short numbered explanation.
- Communicate creating a trip, inviting friends, asking the planner and proposing an experience.
- Avoid replacing the product presentation with a generic feature-card grid.

### 3. Personal control — navy / Electric Express

- “One group adventure. Your money. Your call.”
- Sky-blue emphasis text and cream primary copy on navy.
- A proposal ticket shows total cost, personal share and participant states.
- The isolated approval/decline demonstration is explicitly labelled; it makes no API calls, requests no wallet signature and moves no funds.
- Explain both fresh individual approval and the member's own automatic approval limits. A member who is not participating is not charged.

### 4. Closing — orange / plane

- Spacious “Good trips start together” message.
- A boarding-pass-inspired CTA with the existing sign-in action.
- One postage-stamp detail and a restrained route accent.
- Footer retains the project link and clear Arc testnet/test-USDC disclosure. Do not imply real-money payments or live travel bookings.

## Navigation and journey indicator

The persistent navigation wordmark and the page-edge journey indicator share the same vehicle state, driven by section visibility through `IntersectionObserver`.

| Section anchor | Vehicle          |
| -------------- | ---------------- |
| `#top`         | Rickshaw         |
| `#how`         | Bus              |
| `#your-share`  | Electric Express |
| `#ready`       | Plane            |

The journey indicator is intentionally minimal:

- Four individual circular stops on a subtle dashed route.
- Only the **active vehicle** is displayed, travelling to the current stop.
- No “01 / 04” counter, chapter caption, Explore arrow, numbered dots or full inactive vehicle icons.
- Each stop is a real section anchor with an accessible name and a minimum 44px target. The current link uses `aria-current="location"`.
- Desktop: a narrow cream rail on the right, with a reserved content gutter and a 60 × 45px active mark.
- At 1100px and below: a compact horizontal cream bar near the bottom, with a 48 × 36px mark and safe-area clearance. Footer padding keeps the last content reachable.

Mobile navigation also has a functional menu, closing after navigation, an outside press or Escape. Logo transitions must never move the wordmark or resize adjacent navigation.

## Surfaces, spacing and decoration

- Controls use the marketing 10px radius; product windows and larger marketing surfaces use 18px; larger bands use 24px; pills use the pill token.
- `--landing-paper-shadow` is for tactile paper/sticker elements and lighter previews. `--landing-window-shadow` gives the main product window a refined lift.
- Keep section spacing generous. Plan and trust content should read as one editorial composition rather than many competing cards.
- Paper details may have small rotations and soft shadows. Avoid heavy outlines, excessive textures, cartoon scenery, generic gradients and glassmorphism.
- Decorative images are nonessential, labelled appropriately and given explicit dimensions. The current Mumbai postcard uses an Unsplash-hosted image.
- Reposition or remove decoration on small screens before compromising readable content.

## Motion and accessibility

- Transport states crossfade with a small scale/slide over 260–420ms.
- The active journey marker travels between stops over 550ms.
- Section entrances are a restrained 24px translation over 750ms. Important content is visible before the observer runs and if it is unavailable.
- Optional postcard parallax uses CSS view timelines with a normal static fallback.
- Button and paper hover effects are subtle. No scroll-jacking, endless decorative motion or bouncing logos.
- Under `prefers-reduced-motion: reduce`, disable crossfade/travel/reveal transitions and use ordinary section navigation.
- Use semantic sections, a skip link, visible keyboard focus and non-color status labels. Check 360, 390, 768 and 1280px layouts for overflow and clipped controls.

## Implementation boundaries

Keep marketing compositions under `apps/web/src/components/landing/`, with scoped layout and motion. Shared brand primitives stay under `components/brand/`. Authenticated pages use the shared cream background, navy text and primary controls, white surfaces, warm dividers, 10px controls and 18px cards. The trip list introduces the orange brand canvas; trip navigation retains its navy frame. Use restrained shadows and generous spacing without adding marketing decoration to financial flows.

Proposal status colors, stamp semantics, money formatting, 44px touch targets and existing authorization behavior remain unchanged. Application headings retain the product scale rather than the marketing hero's display size. Shared controls provide consistency across Plan, Itinerary, Money, onboarding and sheets without replacing their layouts.

Reuse `SignInButton` for every real sign-in/Get started action and `ProposalTicket`, `Amount` and member avatars for product presentation. Preserve the signed-in home, trip routes, authentication, World approval and financial authorization rules. Illustrations must be marked as examples and never passed to the API as real trip state.
