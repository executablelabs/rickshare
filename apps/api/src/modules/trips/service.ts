import { randomBytes, randomUUID } from "node:crypto";
import { arcTestnet, asHex, inviteTypedData } from "@rickshare/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import { type Address, getAddress, type Hex } from "viem";
import type { AppDatabase } from "../../db/client";
import {
  indexedVaults,
  memberMetadata,
  tripCreations,
  tripInvites,
  tripMetadata,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { IndexerService } from "../indexer/service";
import type { TripChain } from "./chain";

export class TripService {
  constructor(
    private readonly db: AppDatabase,
    private readonly chain: TripChain,
    private readonly indexer: IndexerService,
    private readonly options: {
      origin: string;
      digest: (token: string) => string;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  async prepare(actor: Address, input: { name: string; endsAt: string }) {
    const endsAt = BigInt(Math.floor(Date.parse(input.endsAt) / 1000));
    const now = Math.floor(this.now() / 1000);
    if (endsAt <= BigInt(now) || endsAt > BigInt(now + 365 * 86400))
      throw new AppError("INVALID_TRIP_END", "Choose a future trip end within one year.", 400);
    const transaction = await this.chain.prepareCreate(actor, endsAt);
    const id = randomUUID();
    const expiresAt = Math.min(this.now() + 3600_000, Number(endsAt) * 1000);
    this.db
      .insert(tripCreations)
      .values({
        id,
        creator: actor.toLowerCase(),
        name: input.name,
        endsAt: endsAt.toString(),
        expiresAt,
      })
      .run();
    return { creationId: id, expiresAt: new Date(expiresAt).toISOString(), transaction };
  }

  async confirm(actor: Address, creationId: string, hash: Hex) {
    const pending = this.db
      .select()
      .from(tripCreations)
      .where(and(eq(tripCreations.id, creationId), eq(tripCreations.creator, actor.toLowerCase())))
      .get();
    if (!pending)
      throw new AppError("CREATION_NOT_FOUND", "This trip creation request was not found.", 404);
    if (pending.vault) {
      let indexed = true;
      try {
        await this.indexer.sync();
        this.indexer.getTrip(pending.vault);
      } catch {
        indexed = false;
        logger.error("TRIP_INDEX_PENDING");
      }
      return { tripId: pending.vault, vaultAddress: getAddress(pending.vault), indexed };
    }
    if (pending.expiresAt <= this.now())
      throw new AppError("CREATION_EXPIRED", "Prepare a fresh trip creation request.", 409);
    const used = this.db
      .select()
      .from(tripCreations)
      .where(eq(tripCreations.transactionHash, hash))
      .get();
    if (used && used.id !== creationId)
      throw new AppError(
        "RECEIPT_ALREADY_USED",
        "This transaction already confirmed another creation request.",
        409,
      );
    const vault = await this.chain.confirmCreate(hash, actor, BigInt(pending.endsAt));
    this.db.transaction((transaction) => {
      transaction
        .update(tripCreations)
        .set({ vault: vault.toLowerCase(), transactionHash: hash })
        .where(eq(tripCreations.id, creationId))
        .run();
      transaction
        .insert(tripMetadata)
        .values({ tripId: vault.toLowerCase(), name: pending.name })
        .onConflictDoUpdate({ target: tripMetadata.tripId, set: { name: pending.name } })
        .run();
    });
    let indexed = true;
    try {
      await this.indexer.sync();
      this.indexer.getTrip(vault);
    } catch {
      indexed = false;
      logger.error("TRIP_INDEX_PENDING");
    }
    return { tripId: vault.toLowerCase(), vaultAddress: vault, indexed };
  }

  async list(actor: Address) {
    await this.indexer.sync();
    return this.db
      .select()
      .from(indexedVaults)
      .where(eq(indexedVaults.scope, this.indexer.cursorId))
      .all()
      .map((row) => this.indexer.getTrip(row.address))
      .filter((trip) =>
        trip.members.some((member) => member.address.toLowerCase() === actor.toLowerCase()),
      );
  }

  async get(actor: Address, vault: Address) {
    const info = await this.chain.info(vault, actor);
    if (!info.isMember)
      throw new AppError("NOT_MEMBER", "Join this trip before accessing it.", 403);
    await this.indexer.sync();
    return this.indexer.requireMember(vault, actor);
  }

  async createInvite(actor: Address, vault: Address, expiresAt?: string | undefined) {
    const info = await this.owner(actor, vault);
    const expiry = expiresAt
      ? Date.parse(expiresAt)
      : Math.min(this.now() + 86400_000, Number(info.endsAt) * 1000);
    if (expiry <= this.now() || expiry > Number(info.endsAt) * 1000)
      throw new AppError(
        "INVALID_INVITE_EXPIRY",
        "The invitation must expire during this trip.",
        400,
      );
    if (info.memberCount >= 32)
      throw new AppError("TRIP_FULL", "This trip already has 32 members.", 409);
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    this.db
      .insert(tripInvites)
      .values({
        id,
        tokenHash: this.options.digest(token),
        tripId: vault.toLowerCase(),
        expiresAt: expiry,
        status: "open",
      })
      .run();
    return {
      inviteId: id,
      url: new URL(`/join/${token}`, this.options.origin).toString(),
      expiresAt: new Date(expiry).toISOString(),
    };
  }

  async invitations(actor: Address, vault: Address) {
    await this.owner(actor, vault);
    return this.db
      .select()
      .from(tripInvites)
      .where(eq(tripInvites.tripId, vault.toLowerCase()))
      .all()
      .map((row) => ({
        inviteId: row.id,
        status: row.expiresAt <= this.now() && row.status !== "joined" ? "expired" : row.status,
        member: row.claimedBy,
        expiresAt: new Date(row.expiresAt).toISOString(),
      }));
  }

  async claim(actor: Address, token: string) {
    const row = this.db
      .select()
      .from(tripInvites)
      .where(eq(tripInvites.tokenHash, this.options.digest(token)))
      .get();
    if (!row) throw new AppError("INVITE_NOT_FOUND", "This invitation was not found.", 404);
    if (row.claimedBy?.toLowerCase() === actor.toLowerCase()) return this.invite(actor, row.id);
    if (row.claimedBy || row.status !== "open")
      throw new AppError(
        "INVITE_ALREADY_CLAIMED",
        "This invitation has already been claimed.",
        409,
      );
    if (row.expiresAt <= this.now())
      throw new AppError("INVITE_EXPIRED", "Ask for a new invitation.", 409);
    const info = await this.chain.info(getAddress(row.tripId), actor);
    if (info.isMember)
      throw new AppError("ALREADY_MEMBER", "You already belong to this trip.", 409);
    if (info.memberCount >= 32)
      throw new AppError("TRIP_FULL", "This trip already has 32 members.", 409);
    const claimed = this.db
      .update(tripInvites)
      .set({ status: "claimed", claimedBy: actor.toLowerCase() })
      .where(
        and(
          eq(tripInvites.id, row.id),
          eq(tripInvites.status, "open"),
          isNull(tripInvites.claimedBy),
          gt(tripInvites.expiresAt, this.now()),
        ),
      )
      .returning()
      .get();
    if (!claimed)
      throw new AppError(
        "INVITE_ALREADY_CLAIMED",
        "This invitation has already been claimed.",
        409,
      );
    return this.invite(actor, row.id);
  }

  async invite(actor: Address, id: string) {
    const row = this.db.select().from(tripInvites).where(eq(tripInvites.id, id)).get();
    if (!row || row.claimedBy?.toLowerCase() !== actor.toLowerCase())
      throw new AppError("INVITE_NOT_FOUND", "This invitation was not found for your wallet.", 404);
    let status = row.expiresAt <= this.now() && row.status !== "joined" ? "expired" : row.status;
    if (status !== "joined" && (await this.chain.info(getAddress(row.tripId), actor)).isMember) {
      this.db.update(tripInvites).set({ status: "joined" }).where(eq(tripInvites.id, id)).run();
      status = "joined";
    }
    const transaction =
      status === "authorized" && row.signature
        ? await this.chain.prepareJoin(
            getAddress(row.tripId),
            actor,
            BigInt(Math.floor(row.expiresAt / 1000)),
            asHex(row.signature),
          )
        : null;
    return {
      inviteId: id,
      tripId: row.tripId,
      status,
      expiresAt: new Date(row.expiresAt).toISOString(),
      transaction,
    };
  }

  async authorize(actor: Address, vault: Address, id: string, signature?: Hex) {
    await this.owner(actor, vault);
    const row = this.db
      .select()
      .from(tripInvites)
      .where(and(eq(tripInvites.id, id), eq(tripInvites.tripId, vault.toLowerCase())))
      .get();
    if (!row?.claimedBy || row.status !== "claimed")
      throw new AppError(
        "INVITE_NOT_CLAIMED",
        "A recipient must claim this invitation first.",
        409,
      );
    if (row.expiresAt <= this.now())
      throw new AppError("INVITE_EXPIRED", "Ask for a new invitation.", 409);
    const data = inviteTypedData({
      chainId: arcTestnet.id,
      vaultAddress: vault,
      member: row.claimedBy,
      deadline: BigInt(Math.floor(row.expiresAt / 1000)),
    });
    if (!signature)
      return {
        typedData: {
          ...data,
          message: { member: data.message.member, deadline: data.message.deadline.toString() },
        },
        authorized: false,
      };
    if (
      !(await this.chain.verifyInvite(
        vault,
        getAddress(row.claimedBy),
        data.message.deadline,
        signature,
      ))
    )
      throw new AppError(
        "INVALID_INVITE_SIGNATURE",
        "The creator signature could not be verified.",
        400,
      );
    const authorized = this.db
      .update(tripInvites)
      .set({ signature, status: "authorized" })
      .where(
        and(
          eq(tripInvites.id, id),
          eq(tripInvites.status, "claimed"),
          gt(tripInvites.expiresAt, this.now()),
        ),
      )
      .returning()
      .get();
    if (!authorized) {
      const current = this.db.select().from(tripInvites).where(eq(tripInvites.id, id)).get();
      if (!current || (current.status !== "authorized" && current.status !== "joined"))
        throw new AppError(
          "INVITE_CHANGED",
          "This invitation changed while it was being authorized.",
          409,
        );
    }
    return { typedData: null, authorized: true };
  }

  async confirmJoin(actor: Address, id: string, hash: Hex) {
    const row = this.db.select().from(tripInvites).where(eq(tripInvites.id, id)).get();
    if (!row || row.claimedBy?.toLowerCase() !== actor.toLowerCase())
      throw new AppError("INVITE_NOT_FOUND", "This invitation was not found for your wallet.", 404);
    if (row.status === "joined") return { tripId: row.tripId, joined: true };
    if (row.status !== "authorized")
      throw new AppError(
        "INVITE_NOT_AUTHORIZED",
        "The creator must authorize this invitation first.",
        409,
      );
    await this.chain.confirmJoin(getAddress(row.tripId), actor, hash);
    this.db
      .update(tripInvites)
      .set({ status: "joined", transactionHash: hash })
      .where(eq(tripInvites.id, id))
      .run();
    try {
      await this.indexer.sync();
    } catch {
      logger.error("JOIN_INDEX_PENDING");
    }
    return { tripId: row.tripId, joined: true };
  }

  async profile(actor: Address, vault: Address, displayName: string) {
    const info = await this.chain.info(vault, actor);
    if (!info.isMember)
      throw new AppError("NOT_MEMBER", "Join this trip before setting your name.", 403);
    const id = `${vault.toLowerCase()}:${actor.toLowerCase()}`;
    this.db
      .insert(memberMetadata)
      .values({ id, displayName })
      .onConflictDoUpdate({ target: memberMetadata.id, set: { displayName } })
      .run();
    this.indexer.refreshMetadata(vault);
    return { address: actor, displayName };
  }

  async rename(actor: Address, vault: Address, name: string) {
    await this.owner(actor, vault);
    this.db
      .insert(tripMetadata)
      .values({ tripId: vault.toLowerCase(), name })
      .onConflictDoUpdate({ target: tripMetadata.tripId, set: { name } })
      .run();
    this.indexer.refreshMetadata(vault);
    return { tripId: vault.toLowerCase(), name };
  }

  private async owner(actor: Address, vault: Address) {
    const info = await this.chain.info(vault, actor);
    if (info.creator.toLowerCase() !== actor.toLowerCase())
      throw new AppError("NOT_CREATOR", "Only the trip creator can manage invitations.", 403);
    if (info.endsAt <= BigInt(Math.floor(this.now() / 1000)))
      throw new AppError("TRIP_ENDED", "This trip has ended.", 409);
    return info;
  }
}
