import { createHash, randomBytes } from "node:crypto";
import { approvalTypedData, HumanApprovalChallenge } from "@rickshare/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import { type Address, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppDatabase } from "../../db/client";
import { worldFlows, worldIdentities, worldProofNullifiers } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { AuthService } from "../auth/service";
import type { ApprovalContext, ApprovalReader } from "./chain";
import { seal, unseal } from "./crypto";
import type { WorldProvider } from "./oidc";
import { type HumanProofProvider, humanApprovalAction } from "./proof";
import { Attestation } from "./schemas";

type WorldOptions = {
  secret: string;
  verifierKey: Hex;
  attestationTtlSeconds: number;
  maxAuthAgeSeconds?: number;
  issuer: string;
  clientId: string;
  now?: () => number;
  onLinked?: (address: Address) => void;
  humanApprovalsEnabled?: boolean;
  proofs?: HumanProofProvider;
};

export class WorldApprovalService {
  private readonly account;
  private readonly now: () => number;

  constructor(
    private readonly db: AppDatabase,
    private readonly auth: AuthService,
    private readonly provider: WorldProvider,
    private readonly reader: ApprovalReader,
    private readonly options: WorldOptions,
  ) {
    this.account = privateKeyToAccount(options.verifierKey);
    this.now = options.now ?? Date.now;
  }

  isLinked(address: string) {
    return !!this.db
      .select()
      .from(worldIdentities)
      .where(eq(worldIdentities.address, address.toLowerCase()))
      .get();
  }

  async start(token: string | undefined, purchase?: { vault: Address; proposalId: bigint }) {
    const session = this.auth.requireSession(token);
    if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    if (purchase) {
      if (this.options.humanApprovalsEnabled && !this.options.proofs)
        throw new AppError(
          "WORLD_HUMAN_NOT_CONFIGURED",
          "World human approval is not configured yet.",
          503,
        );
      if (!this.isLinked(session.address))
        throw new AppError(
          "WORLD_NOT_LINKED",
          "Link your World identity before approving a share.",
          409,
        );
      await this.reader(purchase.vault, purchase.proposalId, session.address);
    }
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const authorizationUrl = await this.provider.authorization({ state, nonce, verifier });
    this.db
      .delete(worldFlows)
      .where(lte(worldFlows.expiresAt, this.now() - 86_400_000))
      .run();
    this.db
      .insert(worldFlows)
      .values({
        id: this.auth.digest(state),
        address: session.address.toLowerCase(),
        sessionHash: this.auth.digest(token),
        nonce,
        verifier: seal(verifier, this.options.secret),
        kind: purchase ? "approve" : "link",
        vault: purchase?.vault.toLowerCase() ?? null,
        proposalId: purchase?.proposalId.toString() ?? null,
        expiresAt: this.now() + 300_000,
        status: "pending",
      })
      .run();
    return { requestId: state, authorizationUrl };
  }

  async finish(
    token: string | undefined,
    input: { state: string; code?: string | undefined; error?: string | undefined },
  ) {
    const session = this.auth.requireSession(token);
    if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    const row = this.db
      .update(worldFlows)
      .set({ status: "processing" })
      .where(
        and(
          eq(worldFlows.id, this.auth.digest(input.state)),
          eq(worldFlows.sessionHash, this.auth.digest(token)),
          eq(worldFlows.address, session.address.toLowerCase()),
          eq(worldFlows.status, "pending"),
          gt(worldFlows.expiresAt, this.now()),
        ),
      )
      .returning()
      .get();
    if (!row)
      throw new AppError(
        "WORLD_FLOW_INVALID",
        "This World request expired or was already used.",
        401,
      );
    if (input.error || !input.code) {
      this.db
        .update(worldFlows)
        .set({ status: "cancelled", errorCode: "WORLD_CANCELLED" })
        .where(eq(worldFlows.id, row.id))
        .run();
      return { status: "cancelled" } as const;
    }
    try {
      const identity = await this.provider.exchange({
        code: input.code,
        nonce: row.nonce,
        verifier: unseal(row.verifier, this.options.secret),
      });
      this.auth.requireSession(token);
      if (
        row.expiresAt <= this.now() ||
        identity.authenticatedAt > Math.floor(this.now() / 1000) + 5 ||
        identity.authenticatedAt < Math.floor((row.expiresAt - 300_000) / 1000) - 5
      )
        throw new AppError("WORLD_EXPIRED", "Complete a fresh World authentication request.", 401);
      const subjectHash = createHash("sha256")
        .update(JSON.stringify([this.options.issuer, this.options.clientId, identity.subject]))
        .digest("hex");
      if (row.kind === "link") {
        this.db.transaction((transaction) => {
          const existing = transaction
            .select()
            .from(worldIdentities)
            .where(eq(worldIdentities.address, row.address))
            .get();
          const owner = transaction
            .select()
            .from(worldIdentities)
            .where(eq(worldIdentities.subjectHash, subjectHash))
            .get();
          if (
            (existing && existing.subjectHash !== subjectHash) ||
            (owner && owner.address !== row.address)
          )
            throw new AppError(
              "WORLD_IDENTITY_MISMATCH",
              "This World identity is already linked to a different wallet.",
              409,
            );
          transaction
            .insert(worldIdentities)
            .values({ address: row.address, subjectHash, linkedAt: this.now() })
            .onConflictDoNothing()
            .run();
          const completed = transaction
            .update(worldFlows)
            .set({ status: "verified" })
            .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, "processing")))
            .returning()
            .get();
          if (!completed)
            throw new AppError("WORLD_CANCELLED", "This World request was cancelled.", 409);
        });
        try {
          this.options.onLinked?.(getAddress(row.address));
        } catch {
          logger.error("WORLD_METADATA_REFRESH_PENDING");
        }
      } else {
        const linked = this.db
          .select()
          .from(worldIdentities)
          .where(eq(worldIdentities.address, row.address))
          .get();
        if (!linked || linked.subjectHash !== subjectHash)
          throw new AppError(
            "WORLD_IDENTITY_MISMATCH",
            "Authenticate with the World identity linked to this wallet.",
            403,
          );
        if (!row.vault || !row.proposalId)
          throw new AppError("WORLD_FLOW_INVALID", "The approval request is incomplete.", 400);
        const context = await this.reader(
          getAddress(row.vault),
          BigInt(row.proposalId),
          session.address,
        );
        if (
          context.member.toLowerCase() !== session.address.toLowerCase() ||
          context.vaultAddress.toLowerCase() !== row.vault ||
          context.proposalId !== BigInt(row.proposalId)
        )
          throw new AppError("APPROVAL_CONTEXT_MISMATCH", "The approval context changed.", 409);
        if (context.verifier.toLowerCase() !== this.account.address.toLowerCase())
          throw new AppError(
            "VERIFIER_MISMATCH",
            "The configured verifier does not match this vault.",
            503,
          );
        if (this.options.humanApprovalsEnabled) {
          if (!this.options.proofs)
            throw new AppError(
              "WORLD_HUMAN_NOT_CONFIGURED",
              "World human approval is not configured.",
              503,
            );
          const expiresAt = Math.min(
            row.expiresAt,
            (identity.authenticatedAt + (this.options.maxAuthAgeSeconds ?? 300)) * 1000,
            Number(context.deadline) * 1000,
            Number(context.quoteExpiresAt) * 1000,
          );
          if (expiresAt <= this.now())
            throw new AppError(
              "WORLD_EXPIRED",
              "Complete a fresh World authentication request.",
              401,
            );
          const challenge = this.options.proofs.challenge(context, row.id, expiresAt);
          const awaiting = this.db
            .update(worldFlows)
            .set({
              status: "awaiting_proof",
              result: JSON.stringify(challenge),
              expiresAt,
            })
            .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, "processing")))
            .returning()
            .get();
          if (!awaiting)
            throw new AppError("WORLD_CANCELLED", "This World request was cancelled.", 409);
          return { status: "awaiting_proof" } as const;
        }
        const attestation = await this.attest(context);
        const completed = this.db
          .update(worldFlows)
          .set({ status: "verified", result: JSON.stringify(attestation) })
          .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, "processing")))
          .returning()
          .get();
        if (!completed)
          throw new AppError("WORLD_CANCELLED", "This World request was cancelled.", 409);
      }
      return { status: "verified" } as const;
    } catch (error) {
      const code = error instanceof AppError ? error.code : "WORLD_VERIFICATION_FAILED";
      this.db
        .update(worldFlows)
        .set({ status: "failed", errorCode: code })
        .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, "processing")))
        .run();
      return { status: "failed" } as const;
    }
  }

  private async attest(context: ApprovalContext): Promise<Attestation> {
    if (context.verifier.toLowerCase() !== this.account.address.toLowerCase())
      throw new AppError(
        "VERIFIER_MISMATCH",
        "The configured verifier does not match this vault.",
        503,
      );
    let deadline = BigInt(
      Math.floor(this.now() / 1000) + Math.min(this.options.attestationTtlSeconds, 900),
    );
    if (deadline > context.deadline) deadline = context.deadline;
    if (deadline > context.quoteExpiresAt) deadline = context.quoteExpiresAt;
    if (deadline <= BigInt(Math.floor(this.now() / 1000)))
      throw new AppError("PROPOSAL_EXPIRED", "Request a new purchase quote.", 409);
    return {
      vaultAddress: context.vaultAddress,
      proposalId: context.proposalId.toString(),
      member: context.member,
      amount: context.amount.toString(),
      nonce: context.nonce.toString(),
      deadline: deadline.toString(),
      chainId: context.chainId,
      signature: await this.account.signTypedData(approvalTypedData({ ...context, deadline })),
    };
  }

  async finishProof(token: string | undefined, requestId: string, proof: unknown) {
    const session = this.auth.requireSession(token);
    if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    if (!this.options.humanApprovalsEnabled || !this.options.proofs)
      throw new AppError("WORLD_HUMAN_NOT_CONFIGURED", "World human approval is not enabled.", 503);
    const row = this.db
      .update(worldFlows)
      .set({ status: "processing_proof" })
      .where(
        and(
          eq(worldFlows.id, this.auth.digest(requestId)),
          eq(worldFlows.sessionHash, this.auth.digest(token)),
          eq(worldFlows.address, session.address.toLowerCase()),
          eq(worldFlows.kind, "approve"),
          eq(worldFlows.status, "awaiting_proof"),
          gt(worldFlows.expiresAt, this.now()),
        ),
      )
      .returning()
      .get();
    if (!row)
      throw new AppError(
        "WORLD_FLOW_INVALID",
        "This human approval expired or was already used.",
        409,
      );
    try {
      if (!row.result || !row.vault || !row.proposalId)
        throw new AppError("WORLD_FLOW_INVALID", "The human approval is incomplete.", 400);
      const challenge = HumanApprovalChallenge.parse(JSON.parse(row.result));
      const nullifierId = await this.options.proofs.verify(proof, challenge);
      this.auth.requireSession(token);
      if (row.expiresAt <= this.now())
        throw new AppError("WORLD_EXPIRED", "Start a fresh World approval.", 401);
      const context = await this.reader(
        getAddress(row.vault),
        BigInt(row.proposalId),
        session.address,
      );
      if (
        context.member.toLowerCase() !== session.address.toLowerCase() ||
        context.vaultAddress.toLowerCase() !== row.vault ||
        context.proposalId.toString() !== row.proposalId ||
        humanApprovalAction(context, row.id) !== challenge.action
      )
        throw new AppError(
          "APPROVAL_CONTEXT_MISMATCH",
          "The purchase changed. Start a fresh approval.",
          409,
        );
      const attestation = await this.attest(context);
      this.auth.requireSession(token);
      this.db.transaction((transaction) => {
        const pending = transaction
          .select()
          .from(worldFlows)
          .where(eq(worldFlows.id, row.id))
          .get();
        if (pending?.status !== "processing_proof" || pending.expiresAt <= this.now())
          throw new AppError(
            "WORLD_CANCELLED",
            "This World request was cancelled or expired.",
            409,
          );
        const consumed = transaction
          .insert(worldProofNullifiers)
          .values({
            id: nullifierId,
            requestId: row.id,
            consumedAt: this.now(),
          })
          .onConflictDoNothing()
          .returning()
          .get();
        if (!consumed)
          throw new AppError("WORLD_PROOF_REPLAY", "This human approval was already used.", 409);
        transaction
          .update(worldFlows)
          .set({ status: "verified", result: JSON.stringify(attestation) })
          .where(eq(worldFlows.id, row.id))
          .run();
      });
      return { status: "verified" } as const;
    } catch (error) {
      const failure =
        error instanceof AppError
          ? error
          : new AppError("WORLD_PROOF_INVALID", "Human approval could not be verified.", 401);
      this.db
        .update(worldFlows)
        .set({ status: "failed", result: null, errorCode: failure.code })
        .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, "processing_proof")))
        .run();
      throw failure;
    }
  }

  status(token: string | undefined, requestId: string) {
    const session = this.auth.requireSession(token);
    if (!token) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    const row = this.db
      .select()
      .from(worldFlows)
      .where(
        and(
          eq(worldFlows.id, this.auth.digest(requestId)),
          eq(worldFlows.sessionHash, this.auth.digest(token)),
          eq(worldFlows.address, session.address.toLowerCase()),
        ),
      )
      .get();
    if (!row) throw new AppError("WORLD_FLOW_INVALID", "This World request was not found.", 404);
    if (
      row.expiresAt <= this.now() &&
      ["pending", "processing", "awaiting_proof", "processing_proof"].includes(row.status)
    )
      return {
        status: "expired",
        errorCode: "WORLD_EXPIRED",
        attestation: null,
        humanApproval: null,
      };
    const attestation =
      row.result && row.status === "verified" ? Attestation.parse(JSON.parse(row.result)) : null;
    const humanApproval =
      row.result && ["awaiting_proof", "processing_proof"].includes(row.status)
        ? HumanApprovalChallenge.parse(JSON.parse(row.result))
        : null;
    if (attestation && BigInt(attestation.deadline) <= BigInt(Math.floor(this.now() / 1000)))
      return {
        status: "expired",
        errorCode: "ATTESTATION_EXPIRED",
        attestation: null,
        humanApproval: null,
      };
    return { status: row.status, errorCode: row.errorCode, attestation, humanApproval };
  }

  cancel(token: string | undefined, requestId: string) {
    this.status(token, requestId);
    const row = this.db
      .select()
      .from(worldFlows)
      .where(eq(worldFlows.id, this.auth.digest(requestId)))
      .get();
    if (
      !row ||
      !["pending", "processing", "awaiting_proof", "processing_proof"].includes(row.status)
    )
      throw new AppError("WORLD_FLOW_FINISHED", "This World request is already finished.", 409);
    const cancelled = this.db
      .update(worldFlows)
      .set({ status: "cancelled", errorCode: "WORLD_CANCELLED", result: null })
      .where(and(eq(worldFlows.id, row.id), eq(worldFlows.status, row.status)))
      .returning()
      .get();
    if (!cancelled)
      throw new AppError("WORLD_FLOW_FINISHED", "This World request already finished.", 409);
    return { status: "cancelled" } as const;
  }
}
