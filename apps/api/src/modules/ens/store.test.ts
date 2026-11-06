import { expect, test } from "bun:test";
import type { Trip } from "@rickshare/shared";
import { getAddress } from "viem";
import { createDatabase } from "../../db/client";
import { ensMembers } from "../../db/schema";
import type { TripNamesInput } from "./service";
import { createEnsStore } from "./store";

const alice = getAddress("0x0000000000000000000000000000000000000001");
const bob = getAddress("0x0000000000000000000000000000000000000002");
const trip: Trip = {
  id: "0xabcd000000000000000000000000000000000001",
  name: "Goa",
  ensName: null,
  vaultAddress: "0xabcd000000000000000000000000000000000001",
  endsAt: "2030-01-01T00:00:00.000Z",
  members: [
    {
      address: alice,
      displayName: "Alice",
      ensName: null,
      worldLinked: false,
      policy: { autoApproveMax: "0", totalCap: "0" },
      deposited: "0",
      spent: "0",
      locked: "0",
      available: "0",
    },
  ],
};
function names(input: TripNamesInput) {
  const name = `${input.label}.rickshare.eth`;
  return {
    trip: name,
    agent: `agent.${name}`,
    registry: alice,
    resolver: bob,
    members: Object.fromEntries(
      input.members.map((member) => [member.address, `${member.label}.${name}`]),
    ),
  };
}

test("issued labels survive renames, reordered members, joins and store reconstruction", () => {
  const db = createDatabase(":memory:");
  try {
    const store = createEnsStore(db, "rickshare.eth");
    const first = store.prepare(trip);
    expect(first.pending).toBe(true);
    expect(first.input.members[0]?.label).toBe("alice");
    store.confirm(trip.id, names(first.input));
    expect(store.prepare(trip).pending).toBe(false);
    const member = trip.members[0];
    if (!member) throw new Error("No fixture member");
    const changed = {
      ...trip,
      name: "Mumbai",
      members: [
        { ...member, address: bob },
        { ...member, displayName: "Different" },
      ],
    };
    const next = createEnsStore(db, "rickshare.eth").prepare(changed);
    expect(next.input.label).toBe(first.input.label);
    expect(next.input.members.map((value) => value.label)).toEqual(["alice-2", "alice"]);
    expect(next.pending).toBe(true);
    expect(
      db
        .select()
        .from(ensMembers)
        .all()
        .filter((value) => value.ready),
    ).toHaveLength(1);
  } finally {
    db.$client.close();
  }
});

test("vaults sharing the short suffix reserve different names", () => {
  const db = createDatabase(":memory:");
  try {
    const store = createEnsStore(db, "rickshare.eth");
    const first = store.prepare(trip);
    const vaultAddress = "0xabcd111100000000000000000000000000000002";
    expect(store.prepare({ ...trip, id: vaultAddress, vaultAddress }).input.label).not.toBe(
      first.input.label,
    );
    expect(() => createEnsStore(db, "other.eth").prepare(trip)).toThrow("different ENS parent");
    expect(() =>
      store.confirm(trip.id, { ...names(first.input), trip: "wrong.rickshare.eth" }),
    ).toThrow("differs from its reservation");
  } finally {
    db.$client.close();
  }
});
