import type { Trip } from "@rickshare/shared";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import type { AppDatabase } from "../../db/client";
import { ensMembers, ensTrips } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { AGENT_LABEL, toLabel, tripLabel } from "./names";
import type { TripNames, TripNamesInput } from "./service";

/** Reserve a readable alias without releasing any name already bound to this member. */
export function reserveMemberAlias(
  db: Pick<AppDatabase, "select" | "insert" | "update" | "delete">,
  tripId: string,
  address: string,
  displayName: string,
) {
  const id = `${tripId}:${address}`;
  const current = db.select().from(ensMembers).where(eq(ensMembers.id, id)).get();
  // Before initial provisioning, prepare() will reserve the member's current display name.
  if (!current) return;
  const reservations = db.select().from(ensMembers).where(eq(ensMembers.tripId, tripId)).all();
  const taken = new Map(reservations.map((member) => [member.label, member]));
  const base = toLabel(displayName, `member-${address.slice(-8)}`);
  let label = base;
  let suffixLength = 8;
  while (label === AGENT_LABEL || (taken.has(label) && taken.get(label)?.address !== address)) {
    if (suffixLength > 40)
      throw new AppError("ENS_LABEL_TAKEN", "A unique member name could not be reserved.", 409);
    label = `${base.slice(0, 62 - suffixLength)}-${address.slice(-suffixLength)}`;
    suffixLength += 4;
  }
  if (label === current.label) return;
  const previousAlias = taken.get(label);
  if (previousAlias) db.delete(ensMembers).where(eq(ensMembers.id, previousAlias.id)).run();
  db.update(ensMembers).set({ label, ready: false }).where(eq(ensMembers.id, id)).run();
  // Archived reservations stay out of the projection, while their onchain records keep resolving.
  db.insert(ensMembers)
    .values({ id: `${id}:${current.label}`, tripId, address, label: current.label, ready: false })
    .run();
}

export function createEnsStore(db: AppDatabase, parentName: string) {
  return {
    prepare(trip: Trip) {
      return db.transaction((tx) => {
        const tripId = trip.id.toLowerCase();
        let saved = tx.select().from(ensTrips).where(eq(ensTrips.tripId, tripId)).get();
        if (!saved) {
          let label = tripLabel(trip.name, trip.vaultAddress);
          let suffixLength = 4;
          while (
            tx
              .select()
              .from(ensTrips)
              .where(eq(ensTrips.name, `${label}.${parentName}`))
              .get()
          ) {
            suffixLength += 4;
            if (suffixLength > 40)
              throw new AppError(
                "ENS_LABEL_TAKEN",
                "A unique trip name could not be reserved.",
                409,
              );
            const suffix = trip.vaultAddress.slice(2, 2 + suffixLength).toLowerCase();
            label = `${toLabel(trip.name, "trip").slice(0, 62 - suffix.length)}-${suffix}`;
          }
          saved = tx
            .insert(ensTrips)
            .values({ tripId, name: `${label}.${parentName}` })
            .returning()
            .get();
        }
        if (!saved.name.endsWith(`.${parentName}`))
          throw new AppError(
            "ENS_PARENT_CHANGED",
            "The issued name uses a different ENS parent.",
            503,
          );
        const existing = tx.select().from(ensMembers).where(eq(ensMembers.tripId, tripId)).all();
        const byAddress = new Map(
          existing
            .filter((member) => member.id === `${tripId}:${member.address}`)
            .map((member) => [member.address, member]),
        );
        const taken = new Set([AGENT_LABEL, ...existing.map((member) => member.label)]);
        for (const member of trip.members) {
          const address = member.address.toLowerCase();
          if (byAddress.has(address)) continue;
          const base = toLabel(member.displayName, `member-${address.slice(2, 6)}`);
          let label = base;
          for (let suffix = 2; taken.has(label); suffix++) label = `${base}-${suffix}`;
          taken.add(label);
          const row = tx
            .insert(ensMembers)
            .values({ id: `${tripId}:${address}`, tripId, address, label })
            .returning()
            .get();
          byAddress.set(address, row);
        }
        const members = trip.members.map((member) => {
          const stored = byAddress.get(member.address.toLowerCase());
          if (!stored)
            throw new AppError("ENS_METADATA_MISSING", "A reserved member name is missing.", 503);
          return {
            address: getAddress(member.address),
            displayName: member.displayName,
            label: stored.label,
          };
        });
        const input: TripNamesInput = {
          vault: getAddress(trip.vaultAddress),
          name: trip.name,
          endsAt: new Date(trip.endsAt),
          label: saved.name.slice(0, -(parentName.length + 1)),
          members,
        };
        return {
          input,
          saved,
          pending:
            !saved.registry ||
            !saved.resolver ||
            [...byAddress.values()].some((member) => !member.ready),
        };
      });
    },
    confirm(tripId: string, names: TripNames) {
      db.transaction((tx) => {
        const saved = tx.select().from(ensTrips).where(eq(ensTrips.tripId, tripId)).get();
        if (saved?.name !== names.trip)
          throw new AppError(
            "ENS_CONTEXT_MISMATCH",
            "The provisioned name differs from its reservation.",
            503,
          );
        tx.update(ensTrips)
          .set({ registry: names.registry, resolver: names.resolver, errorCode: null })
          .where(eq(ensTrips.tripId, tripId))
          .run();
        for (const [address, name] of Object.entries(names.members)) {
          const id = `${tripId}:${address.toLowerCase()}`;
          const member = tx.select().from(ensMembers).where(eq(ensMembers.id, id)).get();
          // A profile edit may have queued another alias while this registration was in flight.
          if (member && name === `${member.label}.${names.trip}`)
            tx.update(ensMembers).set({ ready: true }).where(eq(ensMembers.id, id)).run();
        }
      });
    },
    fail(tripId: string, errorCode: string) {
      db.update(ensTrips).set({ errorCode }).where(eq(ensTrips.tripId, tripId)).run();
    },
    published(tripId: string, itineraryHash: string) {
      db.update(ensTrips)
        .set({ itineraryHash, errorCode: null })
        .where(eq(ensTrips.tripId, tripId))
        .run();
    },
  };
}

export type EnsStore = ReturnType<typeof createEnsStore>;
