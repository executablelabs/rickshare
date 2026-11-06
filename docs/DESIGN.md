# DESIGN.md

## Brief
Subject: a shared trip fund where an agent proposes purchases and each person approves their own share.
Audience: friends traveling together, most of whom have never used crypto.
Primary job: make "what is this, who is it for, what is my share, have I agreed" readable in one glance on a phone.

## Concept: tickets and stamps
Every proposal is a ticket. Every approval is a stamp on it. The ticket card and its stamps are the one memorable element. Around them, color is used with intent: navy frames the app (header band, navigation), coral marks the one action that needs you, and soft tints carry status and tell members apart. Everything else stays quiet: plenty of white space, one type family for UI, no decoration.

## Color: coral and navy
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F6F7FA` | App background |
| `--card` | `#FFFFFF` | Tickets, sheets, inputs |
| `--ink` | `#16213E` | Navy. Primary text, header band, desktop rail, active tab |
| `--ink-muted` | `#5B6475` | Secondary text |
| `--rule` | `#E1E5EE` | Hairlines, perforations, input borders |
| `--rule-strong` | `#C9D2E6` | Secondary button ring, hovered input border |
| `--coral` | `#CC4127` | Primary actions ("Approve my share"), the active-tab marker on desktop |
| `--coral-strong` | `#A8341F` | Primary action hover and press |
| `--coral-tint` / `--coral-ink` | `#FFEDE8` / `#9A2A17` | "Waiting for you" |
| `--stamp` | `#2563EB` | Approved rings, focus ring |
| `--stamp-tint` / `--stamp-ink` | `#DBEAFE` / `#1D4ED8` | Approved labels and chips, links |
| `--marigold` | `#E9A21B` | Waiting rings and dots, the body of the brand mark |
| `--marigold-tint` / `--marigold-ink` | `#FEF3C7` / `#92400E` | Waiting chips |
| `--declined` | `#BE123C` | "Not for me" stamps and destructive actions only |
| `--declined-tint` | `#FFE4E6` | Declined chips |
| `--teal-tint` / `--teal-ink` | `#CCFBF1` / `#115E59` | Member avatars only |
| `--violet-tint` / `--violet-ink` | `#EDE9FE` / `#5B21B6` | Member avatars only |

Members get a stable avatar tint from their address, picked from coral, stamp, marigold, teal and violet tints with the matching ink for the initial. Status never relies on the avatar tint; it is the ring plus the text label.

Contrast: body text uses `--ink` on `--paper` or `--card`. White on `--coral` is 4.8:1 and on `--ink` far higher. A tint is only ever paired with its own ink. `--marigold` and `--coral` are never used for small text on white.

Shadows: `--shadow-card`, one soft shadow under tickets and other raised cards, and `--shadow-sheet` under open sheets. Nothing else casts a shadow.

## Brand
The mark is an auto-rickshaw seen from the side with two riders under one hood: one ride, shared. The hood, riders and wheels are `--ink` (or `--card` on an ink background); the body is `--marigold`. The wordmark is "Rickshare" in Bricolage Grotesque 600, with "share" in `--marigold` when it sits on `--ink`.
- Source files live in `apps/web/public/brand/`. The in-app version is the `RickshawMark` component, and a test keeps the two identical.
- Smallest size: 24px wide. Keep clear space of half the mark's height on every side.
- Do not redraw, recolor, outline or add effects to the mark.

## Type
- UI and body: **Geist** (variable), via Fontsource.
- Headings, ticket titles and large amounts: **Bricolage Grotesque** (variable), via Fontsource.
- All amounts: `font-variant-numeric: tabular-nums` so figures line up.
- Scale (px): 13 / 15 / 16 / 18 / 22 / 28 / 36. Body 16 on mobile, so iOS never zooms into inputs. Line height 1.5 for body, 1.15 for headings.
- Sentence case everywhere. No all-caps labels. Weights 400 and 600 only.

## Layout
Mobile (default, 390px): single column, 20px side padding, bottom nav with three tabs: **Plan**, **Itinerary**, **Money**. The header is a navy band with 24px rounded bottom corners. It shows the trip name in white and a member avatar stack, and tapping the stack opens balances. Without a trip name, it shows the brand mark and wordmark. The active bottom tab is a navy pill with white text.

```
┌────────────────────────────┐
│ India 26          (A)(B)(G)│
├────────────────────────────┤
│  agent message             │
│ ┌────────────────────────┐ │
│ │ Paragliding, Arambol   │ │
│ │ Goa Adventures         │ │
│ │ Sat 14 Dec, 10:00      │ │
│ │ $84.00  Your share $42 │ │
│ ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤ │  perforation with side notches
│ │ (A) approved            │ │  stamps
│ │ (G) waiting   (B) not in│ │
│ │ [Approve my share]      │ │
│ │ [Not for me]            │ │
│ └────────────────────────┘ │
│ [ Ask for ideas...      ⏎ ]│
├────────────────────────────┤
│   Plan   Itinerary   Money │
└────────────────────────────┘
```

Desktop (1024px and up): a navy left rail with the brand at the top and the tabs below it. The active tab has a light pill and a coral marker. The Plan feed sits in a 560px column, beside a right panel showing the group's money (balances, limits, recent activity). Content is left-aligned; nothing is centered except empty states.

## Components
- **ProposalTicket**: title (Bricolage 18), merchant and time on separate lines, total and "Your share", perforation, member stamps, actions. States: waiting for you (marigold edge on the left), waiting for others, approved, not for you (collapsed, muted), declined, ticket issued, refunded.
- **Stamp**: the member's tinted avatar with a status ring (`--stamp` approved, `--marigold` waiting, `--declined` declined, `--rule` not in) and a short text label ("Approved", "Waiting", "Not in", "Declined"). Text is always present, so color is never the only signal.
- **Amount**: `$42.00` with tabular numbers. The Money tab notes once that balances are in USDC.
- **Sheet**: bottom sheet on mobile (vaul), side panel on desktop. Used for My limits, Add money and balances.
- **Buttons**: primary is a `--coral` fill with white text, darkening to `--coral-strong` on hover and press. Secondary is white with a `--rule-strong` ring and ink text. Destructive uses `--declined` text only. All are 48px tall with a 12px radius, and their colors change over 150ms, never under reduced motion.
- **Chips**: a tint fill with its own ink text. A waiting chip also has a `--marigold` dot.
- **Inputs**: white with a `--rule` ring, `--rule-strong` on hover and `--declined` on error.
- **Radii**: tickets 16, sheets 20 (top corners), header band 24 (bottom corners), buttons and inputs 12, avatars and chips full.
- Icons: Phosphor, regular weight, 20px.

## Motion
One signature moment: when you approve, your stamp presses onto the ticket (scale 1.12 to 1, rotate -6deg to -2deg, 180ms, ease-out). Sheets slide (200ms). Under `prefers-reduced-motion`, the stamp appears without motion.

Nothing animates on page load, with one exception: the splash. On the first load in a browser session, the rickshaw drives in on `--ink`, parks, and slides left as the wordmark appears beside it. Then the splash fades out. It lasts at most 2s, stops covering the app as soon as it fades, and is skipped entirely under reduced motion.

Loading: when something needs a loading state, show the rickshaw loader, with wheels turning above a moving road and a plain label such as "Loading trip". Under reduced motion it is shown still.

## Copy
- Plain verbs, sentence case, no exclamation marks, no emoji.
- Actions keep their name through the flow: the button "Approve my share" leads to the toast "Share approved".
- Use: "Add money", "My limits", "Approve my share", "Not for me", "Waiting on Bashy", "Your share", "Ticket ready".
- Avoid crypto words in the UI: no "wallet address", "gas", "sign transaction" on primary screens. Technical details live behind a "Details" disclosure with explorer links.
- Errors say what happened and what to do: "Your verification expired. Approve again to retry."
- Empty Plan: "Ask for ideas, like 'two days in Goa under $100 each'."

## Do not
Gradients, glass effects, colored backgrounds on containers (except the navy header band, the navy rail and status tints), grids of identical cards, all-caps eyebrow labels, arrows appended to button text, middle-dot separated metadata, monospace for labels, stock shadcn styling left unchanged, decorative illustrations.

## Quality floor
Works at 360px. 44px minimum touch targets. Visible focus ring (2px `--stamp`, 2px offset). AA contrast. Keyboard reachable. Reduced motion respected.