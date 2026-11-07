import { asHex, quoteTypedData, SignedQuote, TicketBundle } from "@rickshare/shared";
import { and, eq, sql } from "drizzle-orm";
import { getAddress, hashTypedData, keccak256, stringToHex, verifyTypedData } from "viem";
import type { AppDatabase } from "../../db/client";
import { chainEvents, proposalSubmissions } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { ProposalChain, SubmittedProposal } from "./chain";
import type { MerchantClient } from "./merchants";

const MAX_UINT256 = (1n << 256n) - 1n;
type Submission = { tripId: string; quote: unknown; shares: { member: string; amount: bigint }[] };

export class ProposalService {
  private queue: Promise<unknown> = Promise.resolve();
  private active = new Map<string, { fingerprint: string; task: Promise<SubmittedProposal> }>();
  constructor(
    private readonly db: AppDatabase,
    private readonly chain: ProposalChain,
    private readonly merchants: Pick<MerchantClient, "ticket"> &
      Partial<Pick<MerchantClient, "paymentRequirements">>,
    private readonly refresh: () => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  submitProposal(input: Submission): Promise<SubmittedProposal> {
    const parsed = SignedQuote.safeParse(input.quote);
    if (!parsed.success)
      return Promise.reject(
        new AppError("INVALID_QUOTE", "A vault-bound signed merchant quote is required.", 400),
      );
    const submission: Submission = {
      tripId: input.tripId,
      quote: parsed.data,
      shares: input.shares.map((share) => ({ ...share })),
    };
    const key = `${submission.tripId.toLowerCase()}:${parsed.data.quoteHash.toLowerCase()}`;
    const fingerprint = JSON.stringify(
      { quote: parsed.data, shares: submission.shares },
      (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    );
    const active = this.active.get(key);
    if (active) {
      if (active.fingerprint !== fingerprint)
        return Promise.reject(
          new AppError(
            "QUOTE_ALREADY_SUBMITTED",
            "This quote is already being submitted with different terms.",
            409,
          ),
        );
      return active.task;
    }
    const task = this.queue
      .then(() => this.submit(submission))
      .finally(() => this.active.delete(key));
    this.active.set(key, { fingerprint, task });
    this.queue = task.catch(() => undefined);
    return task;
  }

  submissionStatus(tripId: string, quoteHash: string) {
    const vault = tripId.toLowerCase();
    const digest = quoteHash.toLowerCase();
    const row = this.db
      .select()
      .from(proposalSubmissions)
      .where(and(eq(proposalSubmissions.quoteHash, digest), eq(proposalSubmissions.vault, vault)))
      .get();
    if (row?.proposalId && row.transactionHash)
      return {
        status: "confirmed" as const,
        proposalId: row.proposalId,
        transactionHash: asHex(row.transactionHash),
      };
    // A durable Proposed event recovers a response lost after broadcast, without sending again.
    const event = row
      ? this.db
          .select()
          .from(chainEvents)
          .where(
            and(
              eq(chainEvents.vault, vault),
              eq(chainEvents.name, "Proposed"),
              sql`lower(json_extract(${chainEvents.payload}, '$.quoteHash')) = ${digest}`,
            ),
          )
          .get()
      : undefined;
    if (event?.proposalId) {
      this.db
        .update(proposalSubmissions)
        .set({
          status: "confirmed",
          proposalId: event.proposalId,
          transactionHash: event.transactionHash,
        })
        .where(eq(proposalSubmissions.quoteHash, digest))
        .run();
      return {
        status: "confirmed" as const,
        proposalId: event.proposalId,
        transactionHash: asHex(event.transactionHash),
      };
    }
    if (this.active.has(`${vault}:${digest}`)) return { status: "processing" as const };
    if (row) return { status: "unconfirmed" as const, transactionHash: row.transactionHash };
    throw new AppError(
      "SUBMISSION_NOT_FOUND",
      "No recorded submission was found. Retry the same reviewed quote.",
      404,
    );
  }

  private async submit(input: Submission): Promise<SubmittedProposal> {
    const parsed = SignedQuote.safeParse(input.quote);
    if (!parsed.success)
      throw new AppError("INVALID_QUOTE", "A vault-bound signed merchant quote is required.", 400);
    const quote = parsed.data;
    const vault = getAddress(input.tripId);
    if (
      quote.vaultAddress.toLowerCase() !== vault.toLowerCase() ||
      quote.chainId !== this.chain.chainId
    )
      throw new AppError(
        "QUOTE_CONTEXT_MISMATCH",
        "The quote belongs to a different trip or chain.",
        400,
      );
    const digest = hashTypedData(quoteTypedData(quote));
    let verified = false;
    try {
      verified =
        digest.toLowerCase() === quote.quoteHash.toLowerCase() &&
        (await verifyTypedData({
          ...quoteTypedData(quote),
          address: getAddress(quote.merchant),
          signature: asHex(quote.signature),
        }));
    } catch {
      verified = false;
    }
    if (!verified)
      throw new AppError(
        "INVALID_QUOTE_SIGNATURE",
        "The merchant quote could not be verified.",
        400,
      );
    if (
      BigInt(quote.total) <= 0n ||
      BigInt(quote.total) > MAX_UINT256 ||
      BigInt(quote.unitPrice) <= 0n ||
      BigInt(quote.unitPrice) > MAX_UINT256 ||
      BigInt(quote.unitPrice) * BigInt(quote.quantity) !== BigInt(quote.total)
    )
      throw new AppError("INVALID_QUOTE_TOTAL", "The quote total is invalid.", 400);
    if (input.shares.length === 0 || input.shares.length > 32)
      throw new AppError("INVALID_SHARES", "Choose one to 32 participants.", 400);
    const shares = input.shares.map((share) => ({
      member: getAddress(share.member),
      amount: share.amount,
    }));
    if (
      new Set(shares.map((share) => share.member.toLowerCase())).size !== shares.length ||
      shares.some(
        (share) =>
          typeof share.amount !== "bigint" || share.amount <= 0n || share.amount > MAX_UINT256,
      ) ||
      shares.reduce((total, share) => total + share.amount, 0n) !== BigInt(quote.total)
    )
      throw new AppError(
        "INVALID_SHARES",
        "Shares must be positive, unique and add up to the quote total.",
        400,
      );
    const intent = JSON.stringify(
      shares
        .map((share) => ({ member: share.member.toLowerCase(), amount: share.amount.toString() }))
        .sort((left, right) => left.member.localeCompare(right.member)),
    );
    const existing = this.db
      .select()
      .from(proposalSubmissions)
      .where(eq(proposalSubmissions.quoteHash, digest))
      .get();
    if (existing) {
      if (existing.intent !== intent || existing.vault !== vault.toLowerCase())
        throw new AppError(
          "QUOTE_ALREADY_SUBMITTED",
          "This quote was submitted with different shares.",
          409,
        );
      if (existing.proposalId && existing.transactionHash)
        return {
          proposalId: existing.proposalId,
          transactionHash: asHex(existing.transactionHash),
        };
      await this.refresh();
      const event = this.db
        .select()
        .from(chainEvents)
        .where(
          and(
            eq(chainEvents.vault, vault.toLowerCase()),
            eq(chainEvents.name, "Proposed"),
            sql`json_extract(${chainEvents.payload}, '$.quoteHash') = ${digest}`,
          ),
        )
        .get();
      if (event?.proposalId) {
        this.db
          .update(proposalSubmissions)
          .set({
            status: "confirmed",
            proposalId: event.proposalId,
            transactionHash: event.transactionHash,
          })
          .where(eq(proposalSubmissions.quoteHash, digest))
          .run();
        return { proposalId: event.proposalId, transactionHash: asHex(event.transactionHash) };
      }
      throw new AppError(
        "SUBMISSION_UNCONFIRMED",
        "This quote was already submitted. Check the plan before requesting another purchase.",
        409,
      );
    }
    if (Date.parse(quote.expiresAt) <= this.now())
      throw new AppError("QUOTE_EXPIRED", "Request a new merchant quote.", 409);
    if (await this.merchants.paymentRequirements?.(quote))
      throw new AppError(
        "X402_VAULT_ADAPTER_REQUIRED",
        "This merchant requires x402. Group-funded payment is waiting for the vault adapter; no purchase was submitted.",
        409,
      );
    const { endsAt } = await this.chain.validate(
      vault,
      getAddress(quote.merchant),
      shares.map((share) => share.member),
    );
    let deadline = BigInt(Math.floor(Date.parse(quote.expiresAt) / 1000)) + 600n;
    const startsAt = BigInt(Math.floor(Date.parse(quote.startsAt) / 1000));
    if (deadline > startsAt) deadline = startsAt;
    if (deadline > endsAt) deadline = endsAt;
    if (deadline <= BigInt(Math.floor(this.now() / 1000)))
      throw new AppError("TRIP_ENDED", "The trip or activity has already ended.", 409);
    this.db
      .insert(proposalSubmissions)
      .values({ quoteHash: digest, vault: vault.toLowerCase(), intent, status: "submitting" })
      .run();
    try {
      const hash = await this.chain.broadcast(quote, shares, deadline);
      this.db
        .update(proposalSubmissions)
        .set({ status: "sent", transactionHash: hash })
        .where(eq(proposalSubmissions.quoteHash, digest))
        .run();
      const result = await this.chain.confirm(vault, digest, hash);
      this.db
        .update(proposalSubmissions)
        .set({
          status: "confirmed",
          proposalId: result.proposalId,
          transactionHash: result.transactionHash,
        })
        .where(eq(proposalSubmissions.quoteHash, digest))
        .run();
      return result;
    } catch {
      this.db
        .update(proposalSubmissions)
        .set({ status: "unconfirmed" })
        .where(eq(proposalSubmissions.quoteHash, digest))
        .run();
      throw new AppError(
        "SUBMISSION_UNCONFIRMED",
        "The transaction may still complete. Check the plan before proposing again.",
        503,
      );
    }
  }

  async ticket(tripId: string, proposalId: string, member: string) {
    const vault = getAddress(tripId);
    const purchase = await this.chain.purchase(vault, BigInt(proposalId));
    if (
      !purchase.participants.some(
        (participant) => participant.toLowerCase() === member.toLowerCase(),
      )
    )
      throw new AppError("NOT_PARTICIPANT", "This ticket does not include you.", 403);
    if (purchase.status !== 2)
      throw new AppError("TICKET_NOT_READY", "The merchant has not issued this ticket.", 409);
    const issued = await this.merchants.ticket(vault, proposalId);
    if (
      keccak256(stringToHex(issued.payload)).toLowerCase() !== purchase.ticketHash.toLowerCase() ||
      issued.ticketHash.toLowerCase() !== purchase.ticketHash.toLowerCase()
    )
      throw new AppError(
        "TICKET_HASH_MISMATCH",
        "The ticket does not match the paid purchase.",
        503,
      );
    let bundle: ReturnType<typeof TicketBundle.parse>;
    try {
      bundle = TicketBundle.parse(JSON.parse(issued.payload));
    } catch {
      throw new AppError("TICKET_INVALID", "The ticket contents could not be verified.", 503);
    }
    if (
      bundle.vaultAddress.toLowerCase() !== vault.toLowerCase() ||
      bundle.ticket.proposalId !== proposalId ||
      bundle.ticket.holders.length !== purchase.participants.length ||
      new Set(bundle.ticket.holders.map((holder) => holder.toLowerCase())).size !==
        purchase.participants.length ||
      !bundle.ticket.holders.every((holder) =>
        purchase.participants.some(
          (participant) => participant.toLowerCase() === holder.toLowerCase(),
        ),
      ) ||
      !["http:", "https:"].includes(new URL(bundle.ticket.url).protocol)
    )
      throw new AppError(
        "TICKET_CONTEXT_MISMATCH",
        "The ticket does not match this purchase's participants.",
        503,
      );
    return bundle.ticket;
  }
}
