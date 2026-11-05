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

export const chainCursors = sqliteTable("chain_cursors", {
  id: text("id").primaryKey(),
  blockNumber: text("block_number").notNull(),
  blockHash: text("block_hash").notNull(),
});

export const indexedVaults = sqliteTable("indexed_vaults", {
  address: text("address").primaryKey(),
  scope: text("scope").notNull(),
  creator: text("creator").notNull(),
  createdBlock: text("created_block").notNull(),
  payload: text("payload").notNull(),
});

export const chainEvents = sqliteTable(
  "chain_events",
  {
    id: text("id").primaryKey(),
    vault: text("vault").notNull(),
    blockNumber: text("block_number").notNull(),
    blockHash: text("block_hash").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    name: text("name").notNull(),
    proposalId: text("proposal_id"),
    payload: text("payload").notNull(),
  },
  (table) => [index("chain_events_vault_proposal").on(table.vault, table.proposalId)],
);

export const projectedProposals = sqliteTable(
  "projected_proposals",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull(),
    proposalId: text("proposal_id").notNull(),
    status: text("status").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [index("projected_proposals_trip").on(table.tripId)],
);

export const tripEvents = sqliteTable(
  "trip_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripId: text("trip_id").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [index("trip_events_trip_id").on(table.tripId, table.id)],
);

export const tripMetadata = sqliteTable("trip_metadata", {
  tripId: text("trip_id").primaryKey(),
  name: text("name").notNull(),
});

export const worldIdentities = sqliteTable("world_identities", {
  address: text("address").primaryKey(),
  subjectHash: text("subject_hash").notNull().unique(),
  linkedAt: integer("linked_at").notNull(),
});

export const worldFlows = sqliteTable(
  "world_flows",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    sessionHash: text("session_hash").notNull(),
    nonce: text("nonce").notNull(),
    verifier: text("verifier").notNull(),
    kind: text("kind").notNull(),
    vault: text("vault"),
    proposalId: text("proposal_id"),
    expiresAt: integer("expires_at").notNull(),
    status: text("status").notNull(),
    result: text("result"),
    errorCode: text("error_code"),
  },
  (table) => [index("world_flows_expiry").on(table.expiresAt)],
);

export const proposalSubmissions = sqliteTable("proposal_submissions", {
  quoteHash: text("quote_hash").primaryKey(),
  vault: text("vault").notNull(),
  intent: text("intent").notNull(),
  status: text("status").notNull(),
  transactionHash: text("transaction_hash"),
  proposalId: text("proposal_id"),
});

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
