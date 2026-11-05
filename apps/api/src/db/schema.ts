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
