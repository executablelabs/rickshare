import { createHash } from "node:crypto";
import { HumanApprovalChallenge } from "@rickshare/shared";
import { signRequest } from "@worldcoin/idkit-server";
import { getAddress, keccak256, stringToHex, toHex } from "viem";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { ApprovalContext } from "./chain";

const Field = z.string().regex(/^0x[a-fA-F0-9]{1,64}$/);
export const WorldHumanProof = z
  .object({
    protocol_version: z.literal("4.0"),
    environment: z.literal("production"),
    nonce: z.string().min(1).max(128),
    action: HumanApprovalChallenge.shape.action,
    session_id: z.never().optional(),
    responses: z
      .array(
        z
          .object({
            identifier: z.string().min(1).max(64),
            issuer_schema_id: z.literal(1),
            signal_hash: Field,
            nullifier: Field,
            expires_at_min: z.number().int().nonnegative(),
            proof: z.array(Field).length(5),
            session_nullifier: z.never().optional(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();

export function humanApprovalAction(context: ApprovalContext, requestId: string) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "rickshare-human-approval-v1",
        requestId,
        context.chainId,
        context.vaultAddress.toLowerCase(),
        context.proposalId.toString(),
        context.member.toLowerCase(),
        context.amount.toString(),
        context.nonce.toString(),
        context.deadline.toString(),
        context.quoteExpiresAt.toString(),
      ]),
    )
    .digest("hex");
  return `rickshare:approve:${hash}`;
}

export function worldSignalHash(signal: string) {
  return toHex(BigInt(keccak256(stringToHex(signal))) >> 8n, { size: 32 });
}

export type HumanProofProvider = {
  challenge(context: ApprovalContext, requestId: string, expiresAt: number): HumanApprovalChallenge;
  verify(proof: unknown, challenge: HumanApprovalChallenge): Promise<string>;
};

export class WorldHumanProofProvider implements HumanProofProvider {
  constructor(
    private readonly options: {
      appId: string;
      rpId: string;
      signingKey: string;
      fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
      now?: () => number;
    },
  ) {}

  challenge(context: ApprovalContext, requestId: string, expiresAt: number) {
    const now = this.options.now?.() ?? Date.now();
    const ttl = Math.min(300, Math.floor((expiresAt - now) / 1000));
    if (ttl < 1) throw new AppError("WORLD_EXPIRED", "Start a fresh World approval.", 401);
    const action = humanApprovalAction(context, requestId);
    const signed = signRequest({ signingKeyHex: this.options.signingKey, action, ttl });
    return HumanApprovalChallenge.parse({
      appId: this.options.appId,
      action,
      signal: `rickshare-member:${context.member.toLowerCase()}`,
      rpContext: {
        rp_id: this.options.rpId,
        nonce: signed.nonce,
        signature: signed.sig,
        created_at: signed.createdAt,
        expires_at: signed.expiresAt,
      },
      share: {
        ...context,
        vaultAddress: getAddress(context.vaultAddress),
        member: getAddress(context.member),
        proposalId: context.proposalId.toString(),
        amount: context.amount.toString(),
        nonce: context.nonce.toString(),
        deadline: context.deadline.toString(),
        quoteExpiresAt: context.quoteExpiresAt.toString(),
      },
    });
  }

  async verify(input: unknown, challenge: HumanApprovalChallenge) {
    const parsed = WorldHumanProof.safeParse(input);
    if (!parsed.success)
      throw new AppError("WORLD_PROOF_INVALID", "World returned an invalid human approval.", 400);
    const proof = parsed.data;
    const credential = proof.responses[0];
    if (
      !credential ||
      proof.action !== challenge.action ||
      proof.nonce !== challenge.rpContext.nonce ||
      BigInt(credential.signal_hash) !== BigInt(worldSignalHash(challenge.signal)) ||
      challenge.rpContext.rp_id !== this.options.rpId ||
      challenge.rpContext.expires_at <= Math.floor((this.options.now?.() ?? Date.now()) / 1000)
    )
      throw new AppError(
        "WORLD_PROOF_MISMATCH",
        "This World proof does not match your approval.",
        401,
      );
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(
        `https://developer.world.org/api/v4/verify/${encodeURIComponent(this.options.rpId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...proof, environment: "production" }),
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        },
      );
    } catch {
      throw new AppError(
        "WORLD_PROOF_UNAVAILABLE",
        "World could not verify your approval. Try again.",
        503,
      );
    }
    if (!response.ok)
      throw new AppError("WORLD_PROOF_REJECTED", "World did not verify this approval.", 401);
    const verification = z
      .object({
        success: z.literal(true),
        environment: z.literal("production"),
        action: z.string().optional(),
        results: z
          .array(
            z.object({
              identifier: z.string(),
              success: z.literal(true),
              nullifier: Field.optional(),
            }),
          )
          .length(1),
      })
      .safeParse(await response.json().catch(() => null));
    const result = verification.success ? verification.data.results[0] : undefined;
    if (
      !verification.success ||
      !result ||
      result.identifier !== credential.identifier ||
      (verification.data.action !== undefined && verification.data.action !== challenge.action) ||
      (result.nullifier !== undefined && BigInt(result.nullifier) !== BigInt(credential.nullifier))
    )
      throw new AppError(
        "WORLD_PROOF_REJECTED",
        "World did not verify the requested human credential.",
        401,
      );
    return createHash("sha256")
      .update(
        JSON.stringify([
          this.options.rpId,
          challenge.action,
          BigInt(credential.nullifier).toString(),
        ]),
      )
      .digest("hex");
  }
}
