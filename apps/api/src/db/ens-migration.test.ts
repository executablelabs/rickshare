import { expect, test } from "bun:test";
import { createDatabase } from "./client";
import { ensMembers, ensTrips } from "./schema";

test("ENS metadata preserves issued names and enforces unique trip/member labels", () => {
  const db = createDatabase(":memory:");
  try {
    db.insert(ensTrips).values({ tripId: "vault-a", name: "goa-a.rickshare.eth" }).run();
    db.insert(ensMembers)
      .values({ id: "vault-a:alice", tripId: "vault-a", address: "alice", label: "alice" })
      .run();
    expect(db.select().from(ensMembers).get()?.ready).toBe(false);
    expect(db.select().from(ensTrips).get()?.resolver).toBeNull();
    expect(() =>
      db.insert(ensTrips).values({ tripId: "vault-b", name: "goa-a.rickshare.eth" }).run(),
    ).toThrow();
    expect(() =>
      db
        .insert(ensMembers)
        .values({ id: "vault-a:bob", tripId: "vault-a", address: "bob", label: "alice" })
        .run(),
    ).toThrow();
  } finally {
    db.$client.close();
  }
});
