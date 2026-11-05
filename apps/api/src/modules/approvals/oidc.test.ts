import { beforeAll, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { WorldOidcProvider } from "./oidc";

const issuer = "https://id.worldcoin.org";
const now = 1_900_000_000;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: JWK;
beforeAll(async () => {
  pair = await generateKeyPair("RS256");
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
});

async function fixture(claims: Record<string, unknown> = {}) {
  const token = await new SignJWT({
    sub: "world-subject",
    nonce: "expected-nonce",
    auth_time: now,
    iat: now,
    exp: now + 300,
    iss: issuer,
    aud: "app_test",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(pair.privateKey);
  const requests: { url: string; body: string }[] = [];
  const provider = new WorldOidcProvider({
    issuer,
    clientId: "app_test",
    clientSecret: "test-client-secret",
    redirectUri: "https://api.example/world/callback",
    maxAuthAgeSeconds: 300,
    keys: createLocalJWKSet({ keys: [jwk] }),
    now: () => now * 1000,
    fetcher: async (url, init) => {
      requests.push({ url, body: String(init?.body ?? "") });
      if (url.endsWith("openid-configuration"))
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks.json`,
        });
      return Response.json({ id_token: token });
    },
  });
  return { provider, requests };
}

test("OIDC requests use PKCE, a fresh login and nonce; real signed tokens are validated", async () => {
  const { provider, requests } = await fixture();
  const url = new URL(
    await provider.authorization({
      state: "state-token",
      nonce: "expected-nonce",
      verifier: "private-pkce-verifier",
    }),
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("prompt")).toBe("login");
  expect(url.searchParams.get("max_age")).toBe("0");
  expect(url.toString()).not.toContain("private-pkce-verifier");
  expect(url.toString()).not.toContain("test-client-secret");
  expect(
    await provider.exchange({
      code: "one-time-code",
      nonce: "expected-nonce",
      verifier: "private-pkce-verifier",
    }),
  ).toEqual({ subject: "world-subject", authenticatedAt: now });
  expect(requests.at(-1)?.body).toContain("code_verifier=private-pkce-verifier");
});

test.each([
  { nonce: "replayed-nonce" },
  { auth_time: now - 301 },
  { auth_time: now + 20 },
  { auth_time: undefined },
  { exp: now - 1 },
  { iss: "https://attacker.example" },
  { aud: "different-client" },
  { aud: ["app_test", "another-app"] },
  { azp: "another-app" },
])("invalid OIDC claims fail closed: %j", async (claims) => {
  const { provider } = await fixture(claims);
  await expect(
    provider.exchange({ code: "code", nonce: "expected-nonce", verifier: "pkce" }),
  ).rejects.toThrow("World verification expired or did not match");
});

test("a token signed by an unknown key is not accepted", async () => {
  const wrong = await generateKeyPair("RS256");
  const token = await new SignJWT({ sub: "subject", nonce: "nonce", auth_time: now })
    .setIssuer(issuer)
    .setAudience("app_test")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(wrong.privateKey);
  const provider = new WorldOidcProvider({
    issuer,
    clientId: "app_test",
    clientSecret: "secret",
    redirectUri: "https://api.example/world/callback",
    maxAuthAgeSeconds: 300,
    keys: createLocalJWKSet({ keys: [jwk] }),
    now: () => now * 1000,
    fetcher: async (url) =>
      url.endsWith("openid-configuration")
        ? Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks.json`,
          })
        : Response.json({ id_token: token }),
  });
  await expect(
    provider.exchange({ code: "code", nonce: "nonce", verifier: "pkce" }),
  ).rejects.toThrow("World verification expired or did not match");
});
