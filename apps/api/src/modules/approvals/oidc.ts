import { createHash } from "node:crypto";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { AppError } from "../../lib/errors";

const Discovery = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});
const Identity = z.object({
  sub: z.string().min(1).max(512),
  nonce: z.string(),
  auth_time: z.number().int().positive(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});
export type VerifiedIdentity = { subject: string; authenticatedAt: number };
export type WorldProvider = {
  authorization(input: { state: string; nonce: string; verifier: string }): Promise<string>;
  exchange(input: { code: string; nonce: string; verifier: string }): Promise<VerifiedIdentity>;
};
export type OidcOptions = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  maxAuthAgeSeconds: number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  keys?: JWTVerifyGetKey;
  now?: () => number;
};

export class WorldOidcProvider implements WorldProvider {
  private metadata: Promise<z.infer<typeof Discovery>> | undefined;
  private keys: JWTVerifyGetKey | undefined;
  private readonly fetcher: (url: string, init?: RequestInit) => Promise<Response>;
  private readonly now: () => number;

  constructor(private readonly options: OidcOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.keys = options.keys;
    this.now = options.now ?? Date.now;
    if (new URL(options.issuer).protocol !== "https:")
      throw new AppError("WORLD_NOT_CONFIGURED", "World requires an HTTPS issuer.", 503);
  }

  private discover() {
    this.metadata ??= (async () => {
      const response = await this.fetcher(
        `${this.options.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(10_000), redirect: "error" },
      );
      if (!response.ok)
        throw new AppError("WORLD_UNAVAILABLE", "World authentication is unavailable.", 503);
      const metadata = Discovery.parse(await response.json());
      if (metadata.issuer !== this.options.issuer)
        throw new AppError(
          "WORLD_ISSUER_MISMATCH",
          "World discovery returned a different issuer.",
          503,
        );
      for (const endpoint of [
        metadata.authorization_endpoint,
        metadata.token_endpoint,
        metadata.jwks_uri,
      ]) {
        const url = new URL(endpoint);
        if (url.protocol !== "https:" || url.origin !== new URL(this.options.issuer).origin)
          throw new AppError(
            "WORLD_ENDPOINT_MISMATCH",
            "World discovery returned an unexpected endpoint.",
            503,
          );
      }
      return metadata;
    })().catch((error: unknown) => {
      this.metadata = undefined;
      throw error;
    });
    return this.metadata;
  }

  async authorization(input: { state: string; nonce: string; verifier: string }) {
    const metadata = await this.discover();
    const url = new URL(metadata.authorization_endpoint);
    for (const [name, value] of Object.entries({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      scope: "openid",
      state: input.state,
      nonce: input.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(input.verifier).digest("base64url"),
      prompt: "login",
      max_age: "0",
    }))
      url.searchParams.set(name, value);
    return url.toString();
  }

  async exchange(input: { code: string; nonce: string; verifier: string }) {
    const metadata = await this.discover();
    const credentials = Buffer.from(
      `${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`,
    ).toString("base64");
    const response = await this.fetcher(metadata.token_endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: this.options.redirectUri,
        code_verifier: input.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new AppError(
        "WORLD_EXCHANGE_FAILED",
        "World authentication could not be completed.",
        401,
      );
    const { id_token } = z
      .object({ id_token: z.string().min(1).max(16384) })
      .parse(await response.json());
    this.keys ??= createRemoteJWKSet(new URL(metadata.jwks_uri), {
      timeoutDuration: 10_000,
      cacheMaxAge: 3_600_000,
    });
    try {
      const { payload } = await jwtVerify(id_token, this.keys, {
        issuer: this.options.issuer,
        audience: this.options.clientId,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "iat", "exp", "nonce", "auth_time"],
        currentDate: new Date(this.now()),
        clockTolerance: 0,
      });
      const claims = Identity.parse(payload);
      const now = Math.floor(this.now() / 1000);
      if (
        claims.nonce !== input.nonce ||
        claims.auth_time > now + 5 ||
        now - claims.auth_time > this.options.maxAuthAgeSeconds ||
        (payload.iat ?? 0) > now + 5 ||
        (payload.azp !== undefined && payload.azp !== this.options.clientId) ||
        (Array.isArray(payload.aud) &&
          payload.aud.length > 1 &&
          payload.azp !== this.options.clientId)
      ) {
        throw new Error("claims do not match the fresh authentication request");
      }
      return { subject: claims.sub, authenticatedAt: claims.auth_time };
    } catch {
      throw new AppError(
        "WORLD_TOKEN_INVALID",
        "World verification expired or did not match this request.",
        401,
      );
    }
  }
}
