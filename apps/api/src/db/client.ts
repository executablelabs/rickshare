import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { config } from "../config";
import * as schema from "./schema";

export function createDatabase(path = config.DATABASE_PATH) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const database = drizzle(sqlite, { schema });
  try {
    migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return database;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
