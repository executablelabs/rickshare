import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "../config";
import * as schema from "./schema";

export function createDatabase(path = config.DATABASE_PATH) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return drizzle(sqlite, { schema });
}
