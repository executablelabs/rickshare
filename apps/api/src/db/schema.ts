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
