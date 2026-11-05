import { createHmac, randomBytes } from "node:crypto";
import { arcTestnet } from "@rickshare/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import { type Address, getAddress, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import type { AppDatabase } from "../../db/client";
import { authChallenges, authSessions } from "../../db/schema";
import { AppError } from "../../lib/errors";

export type AuthSession = { address: Address; expiresAt: string };
export type AuthEnv = { Variables: { session: AuthSession } };
export type AuthOptions = {
  origin: string;
  secret: string;
  nonceTtlSeconds: number;
  sessionTtlSeconds: number;
  verifySignature: (input: {
    address: Address;
    message: string;
    signature: Hex;
  }) => Promise<boolean>;
  now?: () => number;
};

export class AuthService {
  private readonly now: () => number;
  readonly origin: string;
  readonly secureCookie: boolean;
  readonly sessionTtlSeconds: number;
  readonly nonceTtlSeconds: number;

  constructor(
    private readonly db: AppDatabase,
    private readonly options: AuthOptions,
  ) {
    if (options.secret.length < 32)
      throw new AppError("AUTH_NOT_CONFIGURED", "Session signing is not configured.", 503);
    this.now = options.now ?? Date.now;
    this.origin = new URL(options.origin).origin;
    this.secureCookie = new URL(this.origin).protocol === "https:";
    this.sessionTtlSeconds = options.sessionTtlSeconds;
    this.nonceTtlSeconds = options.nonceTtlSeconds;
  }

  digest(token: string): string {
    return createHmac("sha256", this.options.secret).update(token).digest("hex");
  }

  issueNonce() {
    const now = this.now();
    this.db.delete(authChallenges).where(lte(authChallenges.expiresAt, now)).run();
    this.db.delete(authSessions).where(lte(authSessions.expiresAt, now)).run();
    const nonce = randomBytes(24).toString("hex");
    const browserToken = randomBytes(32).toString("hex");
    this.db
      .insert(authChallenges)
      .values({
        id: this.digest(nonce),
        browserBinding: this.digest(browserToken),
        expiresAt: now + this.nonceTtlSeconds * 1000,
      })
      .run();
    return { nonce, browserToken };
  }

  async verify(message: string, signature: Hex, challenge: string | undefined) {
    let parsed: ReturnType<typeof parseSiweMessage>;
    try {
      parsed = parseSiweMessage(message);
    } catch {
      throw new AppError("INVALID_SIWE", "The sign-in message is invalid.", 400);
    }
    const now = this.now();
    if (
      !challenge ||
      !parsed.address ||
      !parsed.nonce ||
      parsed.chainId !== arcTestnet.id ||
      parsed.version !== "1" ||
      parsed.uri !== this.origin ||
      !parsed.issuedAt ||
      parsed.issuedAt.getTime() > now + 30_000 ||
      parsed.issuedAt.getTime() < now - this.nonceTtlSeconds * 1000 ||
      !validateSiweMessage({
        message: parsed,
        domain: new URL(this.origin).host,
        nonce: parsed.nonce,
        time: new Date(now),
      })
    ) {
      throw new AppError(
        "INVALID_SIWE",
        "The sign-in challenge does not match this application.",
        401,
      );
    }
    const consumed = this.db
      .delete(authChallenges)
      .where(
        and(
          eq(authChallenges.id, this.digest(parsed.nonce)),
          eq(authChallenges.browserBinding, this.digest(challenge)),
          gt(authChallenges.expiresAt, now),
        ),
      )
      .returning()
      .get();
    if (!consumed) throw new AppError("NONCE_EXPIRED", "Request a new sign-in challenge.", 401);
    const address = getAddress(parsed.address);
    let verified: boolean;
    try {
      verified = await this.options.verifySignature({ address, message, signature });
    } catch {
      throw new AppError(
        "SIGNATURE_CHECK_UNAVAILABLE",
        "Wallet verification is temporarily unavailable.",
        503,
      );
    }
    if (!verified)
      throw new AppError("INVALID_SIGNATURE", "The wallet signature could not be verified.", 401);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + this.sessionTtlSeconds * 1000;
    this.db
      .insert(authSessions)
      .values({ id: this.digest(token), address: address.toLowerCase(), expiresAt })
      .run();
    return { token, session: { address, expiresAt: new Date(expiresAt).toISOString() } };
  }

  session(token: string | undefined): AuthSession | null {
    if (!token) return null;
    const row = this.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.id, this.digest(token)), gt(authSessions.expiresAt, this.now())))
      .get();
    return row
      ? { address: getAddress(row.address), expiresAt: new Date(row.expiresAt).toISOString() }
      : null;
  }

  requireSession(token: string | undefined): AuthSession {
    const session = this.session(token);
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    return session;
  }

  logout(token: string | undefined) {
    if (token)
      this.db
        .delete(authSessions)
        .where(eq(authSessions.id, this.digest(token)))
        .run();
  }
}
