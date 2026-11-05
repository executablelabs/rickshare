import { afterEach, expect, test } from "bun:test";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";
import { createApp } from "../../app";
import { type AppDatabase, createDatabase } from "../../db/client";
import { authSessions } from "../../db/schema";
import { AuthService } from "./service";

const origin = "http://localhost:5173";
const alice = privateKeyToAccount(`0x${"01".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"02".repeat(32)}`);
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

function fixture() {
  let now = Date.now();
  const db = createDatabase(":memory:");
  databases.push(db);
  const options = {
    origin,
    secret: "test-session-secret-with-at-least-32-characters",
    nonceTtlSeconds: 300,
    sessionTtlSeconds: 3600,
    verifySignature: verifyMessage,
    now: () => now,
  };
  const auth = new AuthService(db, options);
  return {
    db,
    auth,
    app: createApp({ auth }),
    options,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    now: () => now,
  };
}

function cookie(response: Response, name: string) {
  const value = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split(";")[0];
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

async function challenge(
  f: ReturnType<typeof fixture>,
  changes: { domain?: string; uri?: string; chainId?: number } = {},
) {
  const response = await f.app.request("/auth/nonce");
  const { nonce } = z.object({ nonce: z.string() }).parse(await response.json());
  const message = createSiweMessage({
    address: alice.address,
    chainId: changes.chainId ?? 5042002,
    domain: changes.domain ?? "localhost:5173",
    uri: changes.uri ?? origin,
    version: "1",
    nonce,
    issuedAt: new Date(f.now()),
    expirationTime: new Date(f.now() + 300_000),
  });
  return {
    response,
    nonce,
    message,
    cookie: cookie(response, "rickshare_nonce"),
    signature: await alice.signMessage({ message }),
  };
}

function verify(
  f: ReturnType<typeof fixture>,
  input: Awaited<ReturnType<typeof challenge>>,
  headers: Record<string, string> = {},
) {
  return f.app.request("/auth/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      Cookie: input.cookie,
      ...headers,
    },
    body: JSON.stringify({ message: input.message, signature: input.signature }),
  });
}

test("real SIWE signatures create opaque HttpOnly sessions and logout revokes them", async () => {
  const f = fixture();
  const input = await challenge(f);
  expect(input.response.headers.get("Cache-Control")).toBe("no-store");
  const response = await verify(f, input);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ address: alice.address });
  expect(response.headers.getSetCookie().join(";")).toContain("HttpOnly");
  const sessionCookie = cookie(response, "rickshare_session");
  const row = f.db.select().from(authSessions).get();
  expect(row?.id).not.toContain(sessionCookie.split("=")[1]);
  expect(
    (await f.app.request("/auth/session", { headers: { Cookie: sessionCookie } })).status,
  ).toBe(200);
  expect(
    (
      await f.app.request("/auth/logout", {
        method: "POST",
        headers: { Origin: origin, Cookie: sessionCookie },
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.app.request("/auth/session", { headers: { Cookie: sessionCookie } })).status,
  ).toBe(401);
});

test("nonce replay and expired sessions fail even when cookies remain present", async () => {
  const f = fixture();
  const input = await challenge(f);
  const response = await verify(f, input);
  expect((await verify(f, input)).status).toBe(401);
  const sessionCookie = cookie(response, "rickshare_session");
  f.advance(3_600_001);
  expect(
    (await f.app.request("/auth/session", { headers: { Cookie: sessionCookie } })).status,
  ).toBe(401);
});

test("a session remains valid across service reconstruction using the same database", async () => {
  const f = fixture();
  const input = await challenge(f);
  const result = await f.auth.verify(
    input.message,
    input.signature,
    input.cookie.slice("rickshare_nonce=".length),
  );
  const restarted = new AuthService(f.db, f.options);
  expect(restarted.session(result.token)?.address).toBe(alice.address);
  restarted.logout(result.token);
  expect(f.auth.session(result.token)).toBeNull();
});

test("cross-origin writes and missing browser challenges are rejected", async () => {
  const f = fixture();
  const input = await challenge(f);
  expect((await verify(f, input, { Origin: "https://attacker.example" })).status).toBe(403);
  expect((await verify(f, input, { Cookie: "" })).status).toBe(401);
  expect((await verify(f, input, { Cookie: `rickshare_nonce=${input.nonce}` })).status).toBe(401);
  expect((await verify(f, input)).status).toBe(200);
});

test.each([{ domain: "attacker.example" }, { uri: "https://attacker.example" }, { chainId: 1 }])(
  "wrong SIWE application or chain fails: %j",
  async (changes) => {
    const f = fixture();
    expect((await verify(f, await challenge(f, changes))).status).toBe(401);
  },
);

test("a different wallet cannot sign in as the member and failures consume the nonce", async () => {
  const f = fixture();
  const input = await challenge(f);
  const original = input.signature;
  input.signature = await bob.signMessage({ message: input.message });
  expect((await verify(f, input)).status).toBe(401);
  input.signature = original;
  expect((await verify(f, input)).status).toBe(401);
});

test("expired challenges cannot create a session", async () => {
  const f = fixture();
  const input = await challenge(f);
  f.advance(300_001);
  expect((await verify(f, input)).status).toBe(401);
});

test("secure deployments mark session cookies Secure", async () => {
  const f = fixture();
  const secure = new AuthService(f.db, { ...f.options, origin: "https://rickshare.example" });
  expect(secure.secureCookie).toBe(true);
});

test("malformed JSON and invalid signature encodings return client errors", async () => {
  const f = fixture();
  for (const body of [
    "{",
    JSON.stringify({ message: "sign in", signature: `0x${"a".repeat(131)}` }),
  ]) {
    const response = await f.app.request("/auth/verify", {
      method: "POST",
      headers: { Origin: origin, "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error.code");
  }
});
