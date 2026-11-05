import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    browserBinding: text("browser_binding").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("auth_challenges_expiry").on(table.expiresAt)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("auth_sessions_expiry").on(table.expiresAt)],
);

// Rows mirror the ChatMessage and ItineraryItem schemas in @kitty/shared. Money never lives here;
// the chain is the source of truth for balances and proposals.

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    // Time-ordered UUIDv7, so (created_at, id) gives a stable order for messages in the same ms.
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull(),
    role: text("role", { enum: ["member", "agent"] }).notNull(),
    author: text("author"),
    text: text("text").notNull(),
    proposalIds: text("proposal_ids", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("chat_messages_trip_created_idx").on(table.tripId, table.createdAt, table.id)],
);

export const itineraryItems = sqliteTable(
  "itinerary_items",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull(),
    startsAt: text("starts_at").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull(),
    proposalId: text("proposal_id"),
    ticketUrls: text("ticket_urls", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [index("itinerary_items_trip_starts_idx").on(table.tripId, table.startsAt)],
);
