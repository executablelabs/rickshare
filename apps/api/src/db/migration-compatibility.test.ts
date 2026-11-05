import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDatabase } from "./client";
import { authSessions, chatMessages, itineraryItems } from "./schema";

const migrations = new URL("../../drizzle/", import.meta.url);
const legacyChatTimestamp = 1793913938438;
const temporaryRoot = fileURLToPath(new URL("../../../../.local/tests/", import.meta.url));
beforeAll(async () => {
  await mkdir(temporaryRoot, { recursive: true });
});
const directories: string[] = [];
afterAll(async () => {
  Bun.gc(true);
  await Bun.sleep(10);
  for (const directory of directories)
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("the original Track B chat database upgrades without losing chat, tickets or later auth tables", async () => {
  const directory = await mkdtemp(join(temporaryRoot, "legacy-chat-"));
  directories.push(directory);
  const path = join(directory, "api.sqlite");
  try {
    const legacy = new Database(path, { create: true });
    const originalSql = (
      await Bun.file(new URL("0004_chat_and_itinerary.sql", migrations)).text()
    ).replaceAll(" IF NOT EXISTS", "");
    legacy.exec(originalSql);
    legacy.exec(
      "CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
    );
    legacy
      .query("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)")
      .run(createHash("sha256").update(originalSql).digest("hex"), legacyChatTimestamp);
    legacy
      .query("INSERT INTO chat_messages VALUES(?,?,?,?,?,?,?)")
      .run(
        "message-1",
        "trip-1",
        "member",
        "0x0000000000000000000000000000000000000001",
        "Keep this conversation",
        "[]",
        "2026-11-06T00:00:00.000Z",
      );
    legacy
      .query("INSERT INTO itinerary_items VALUES(?,?,?,?,?,?,?)")
      .run(
        "item-1",
        "trip-1",
        "2026-12-01T00:00:00.000Z",
        "Paid ferry",
        "Mumbai",
        "1",
        '["https://tickets.example/paid"]',
      );
    legacy.close();
    const upgraded = createDatabase(path);
    try {
      expect(upgraded.select().from(chatMessages).get()?.text).toBe("Keep this conversation");
      expect(upgraded.select().from(itineraryItems).get()?.ticketUrls).toEqual([
        "https://tickets.example/paid",
      ]);
      expect(upgraded.select().from(authSessions).all()).toEqual([]);
    } finally {
      upgraded.$client.close();
    }
    const reopened = createDatabase(path);
    try {
      expect(reopened.select().from(chatMessages).all()).toHaveLength(1);
    } finally {
      reopened.$client.close();
    }
  } finally {
    Bun.gc(true);
  }
});

test("an existing Track A database gains chat tables while preserving its sessions", async () => {
  const directory = await mkdtemp(join(temporaryRoot, "legacy-auth-"));
  directories.push(directory);
  const path = join(directory, "api.sqlite");
  try {
    const legacy = new Database(path, { create: true });
    legacy.exec(
      "CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
    );
    const journal = z
      .object({ entries: z.array(z.object({ tag: z.string(), when: z.number() })) })
      .parse(await Bun.file(new URL("meta/_journal.json", migrations)).json());
    for (const entry of journal.entries.slice(0, 4)) {
      const sql = await Bun.file(new URL(`${entry.tag}.sql`, migrations)).text();
      legacy.exec(sql);
      legacy
        .query("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)")
        .run(createHash("sha256").update(sql).digest("hex"), entry.when);
    }
    legacy
      .query("INSERT INTO auth_sessions(id,address,expires_at) VALUES(?,?,?)")
      .run("existing-session-hash", "0x0000000000000000000000000000000000000001", 2000000000000);
    legacy.close();
    const upgraded = createDatabase(path);
    try {
      expect(upgraded.select().from(authSessions).get()?.id).toBe("existing-session-hash");
      expect(upgraded.select().from(chatMessages).all()).toEqual([]);
    } finally {
      upgraded.$client.close();
    }
  } finally {
    Bun.gc(true);
  }
});
