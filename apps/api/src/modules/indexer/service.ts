import { Proposal, Trip, TripEvent } from "@rickshare/shared";
import { and, asc, eq, gt } from "drizzle-orm";
import { type Address, getAddress } from "viem";
import type { AppDatabase } from "../../db/client";
import {
  chainCursors,
  chainEvents,
  indexedVaults,
  projectedProposals,
  tripEvents,
  tripMetadata,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { TripEventBus } from "./bus";
import type { IndexSource, TripEventEnvelope } from "./types";

export class IndexerService {
  readonly bus = new TripEventBus();
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  readonly cursorId: string;

  constructor(
    readonly db: AppDatabase,
    private readonly source: IndexSource,
    private readonly startBlock = 0n,
  ) {
    this.cursorId = `${source.chainId}:${source.factory.toLowerCase()}`;
  }

  sync(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.cycle().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  start(interval: number) {
    if (this.timer) return;
    const run = () => {
      void this.sync().catch(() => logger.error("INDEXER_SYNC_FAILED"));
    };
    run();
    this.timer = setInterval(run, interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async cycle() {
    const head = await this.source.head();
    const cursor = this.db
      .select()
      .from(chainCursors)
      .where(eq(chainCursors.id, this.cursorId))
      .get();
    if (
      cursor &&
      (BigInt(cursor.blockNumber) > head ||
        (await this.source.blockHash(BigInt(cursor.blockNumber))) !== cursor.blockHash)
    ) {
      throw new AppError(
        "CHAIN_HISTORY_CHANGED",
        "Indexed chain history changed; rebuild this projection database.",
        503,
      );
    }
    let from = cursor ? BigInt(cursor.blockNumber) + 1n : this.startBlock;
    while (from <= head) {
      let to = from + 199n;
      if (to > head) to = head;
      await this.batch(from, to);
      from = to + 1n;
    }
  }

  private async batch(from: bigint, to: bigint) {
    const created = await this.source.created(from, to);
    const known = this.db
      .select()
      .from(indexedVaults)
      .where(eq(indexedVaults.scope, this.cursorId))
      .all();
    const vaults = [
      ...new Set([
        ...known.map((row) => getAddress(row.address)),
        ...created.map((row) => row.vault),
      ]),
    ];
    const logs = await this.source.events(vaults, from, to);
    const snapshots = await Promise.all(
      vaults.map(async (vault: Address) => {
        const previous = this.db
          .select()
          .from(projectedProposals)
          .where(eq(projectedProposals.tripId, vault.toLowerCase()))
          .all();
        const ids = [
          ...new Set([
            ...previous.map((row) => row.proposalId),
            ...logs
              .filter(
                (log) => log.vault.toLowerCase() === vault.toLowerCase() && log.proposalId !== null,
              )
              .map((log) => log.proposalId)
              .filter((id): id is string => id !== null),
          ]),
        ];
        return this.source.snapshot(vault, to, ids);
      }),
    );
    const hash = await this.source.blockHash(to);
    const committed = this.db.transaction((transaction) => {
      const events: TripEventEnvelope[] = [];
      const append = (tripId: string, data: TripEvent) => {
        const row = transaction
          .insert(tripEvents)
          .values({ tripId, payload: JSON.stringify(TripEvent.parse(data)) })
          .returning()
          .get();
        events.push({ id: row.id.toString(), tripId, data });
      };
      for (const log of logs) {
        transaction
          .insert(chainEvents)
          .values({
            id: `${this.source.chainId}:${log.transactionHash}:${log.logIndex}`,
            vault: log.vault.toLowerCase(),
            blockNumber: log.blockNumber.toString(),
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            name: log.name,
            proposalId: log.proposalId,
            payload: JSON.stringify(log.args, (_key: string, value: unknown) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          })
          .onConflictDoNothing()
          .run();
      }
      for (const snapshot of snapshots) {
        const tripId = snapshot.address.toLowerCase();
        const previous = transaction
          .select()
          .from(indexedVaults)
          .where(eq(indexedVaults.address, tripId))
          .get();
        const metadata = transaction
          .select()
          .from(tripMetadata)
          .where(eq(tripMetadata.tripId, tripId))
          .get();
        const trip = Trip.parse({
          id: tripId,
          name:
            metadata?.name ?? `Trip ${snapshot.address.slice(0, 8)}…${snapshot.address.slice(-6)}`,
          ensName: null,
          vaultAddress: snapshot.address,
          endsAt: snapshot.endsAt,
          members: snapshot.members,
        });
        const payload = JSON.stringify(trip);
        const born = created.find((row) => row.vault.toLowerCase() === tripId);
        const createdBlock = previous?.createdBlock ?? born?.createdBlock.toString();
        if (!createdBlock)
          throw new AppError("INDEX_HISTORY_MISSING", "Trip creation history is missing.", 503);
        transaction
          .insert(indexedVaults)
          .values({
            address: tripId,
            scope: this.cursorId,
            creator: snapshot.creator.toLowerCase(),
            createdBlock,
            payload,
          })
          .onConflictDoUpdate({ target: indexedVaults.address, set: { payload } })
          .run();
        if (previous?.payload !== payload)
          append(tripId, { type: "balances.updated", members: trip.members });
        for (const proposal of snapshot.proposals) {
          const id = `${tripId}:${proposal.id}`;
          const old = transaction
            .select()
            .from(projectedProposals)
            .where(eq(projectedProposals.id, id))
            .get();
          const submitted = transaction
            .select()
            .from(chainEvents)
            .where(
              and(
                eq(chainEvents.vault, tripId),
                eq(chainEvents.proposalId, proposal.id),
                eq(chainEvents.name, "Proposed"),
              ),
            )
            .get();
          if (!submitted)
            throw new AppError(
              "INDEX_HISTORY_MISSING",
              "Proposal submission history is missing.",
              503,
            );
          const projected = Proposal.parse({ ...proposal, txHash: submitted.transactionHash });
          const encoded = JSON.stringify(projected);
          transaction
            .insert(projectedProposals)
            .values({
              id,
              tripId,
              proposalId: projected.id,
              status: projected.status,
              payload: encoded,
            })
            .onConflictDoUpdate({
              target: projectedProposals.id,
              set: { status: projected.status, payload: encoded },
            })
            .run();
          if (old?.payload !== encoded)
            append(tripId, {
              type: old ? "proposal.updated" : "proposal.created",
              proposal: projected,
            });
        }
      }
      transaction
        .insert(chainCursors)
        .values({ id: this.cursorId, blockNumber: to.toString(), blockHash: hash })
        .onConflictDoUpdate({
          target: chainCursors.id,
          set: { blockNumber: to.toString(), blockHash: hash },
        })
        .run();
      return events;
    });
    for (const event of committed) this.bus.publish(event);
  }

  getTrip(tripId: string): Trip {
    const row = this.db
      .select()
      .from(indexedVaults)
      .where(
        and(
          eq(indexedVaults.address, tripId.toLowerCase()),
          eq(indexedVaults.scope, this.cursorId),
        ),
      )
      .get();
    if (!row) throw new AppError("TRIP_NOT_FOUND", "This trip has not been indexed.", 404);
    return Trip.parse(JSON.parse(row.payload));
  }

  requireMember(tripId: string, member: string): Trip {
    const trip = this.getTrip(tripId);
    if (!trip.members.some((entry) => entry.address.toLowerCase() === member.toLowerCase()))
      throw new AppError("NOT_MEMBER", "Join this trip before accessing it.", 403);
    return trip;
  }

  proposals(tripId: string): Proposal[] {
    return this.db
      .select()
      .from(projectedProposals)
      .where(eq(projectedProposals.tripId, tripId.toLowerCase()))
      .all()
      .map((row) => Proposal.parse(JSON.parse(row.payload)));
  }

  events(tripId: string, after = 0, limit = 100): TripEventEnvelope[] {
    return this.db
      .select()
      .from(tripEvents)
      .where(and(eq(tripEvents.tripId, tripId.toLowerCase()), gt(tripEvents.id, after)))
      .orderBy(asc(tripEvents.id))
      .limit(Math.min(limit, 100))
      .all()
      .map((row) => ({
        id: row.id.toString(),
        tripId: row.tripId,
        data: TripEvent.parse(JSON.parse(row.payload)),
      }));
  }
}
