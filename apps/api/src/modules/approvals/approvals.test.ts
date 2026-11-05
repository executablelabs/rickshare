import { afterEach, expect, test } from "bun:test";
import { approvalTypedData } from "@kitty/shared";
import { getAddress, verifyMessage, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";
import { createApp } from "../../app";
import { type AppDatabase, createDatabase } from "../../db/client";
import { worldFlows, worldIdentities } from "../../db/schema";
import { AuthService } from "../auth/service";
import type { ApprovalContext } from "./chain";
import type { VerifiedIdentity, WorldProvider } from "./oidc";
import { WorldApprovalService } from "./service";

const alice = privateKeyToAccount(`0x${"01".repeat(32)}`);
const verifierKey = `0x${"03".repeat(32)}` as const;
const signer = privateKeyToAccount(verifierKey);
const vault = getAddress("0x0000000000000000000000000000000000000123");
const secret = "test-secret-with-at-least-32-characters";
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

async function fixture() {
  let now = Date.now();
  let subject = "linked-world-subject";
  const db = createDatabase(":memory:");
  databases.push(db);
  const auth = new AuthService(db, {
    origin: "http://localhost:5173",
    secret,
    nonceTtlSeconds: 300,
    sessionTtlSeconds: 3600,
    verifySignature: verifyMessage,
    now: () => now,
  });
  const login = async () => {
    const challenge = auth.issueNonce();
    const message = createSiweMessage({
      address: alice.address,
      chainId: 5042002,
      domain: "localhost:5173",
      uri: "http://localhost:5173",
      version: "1",
      nonce: challenge.nonce,
      issuedAt: new Date(now),
    });
    return auth.verify(message, await alice.signMessage({ message }), challenge.browserToken);
  };
  const { token } = await login();
  const requests: { state: string; nonce: string; verifier: string }[] = [];
  const provider: WorldProvider = {
    authorization: async (input) => {
      requests.push(input);
      return `https://id.worldcoin.org/authorize?state=${input.state}`;
    },
    exchange: async () => ({ subject, authenticatedAt: Math.floor(now / 1000) }),
  };
  const context: ApprovalContext = {
    chainId: 5042002,
    vaultAddress: vault,
    proposalId: 1n,
    member: alice.address,
    amount: 10_000_000n,
    nonce: 0n,
    deadline: BigInt(Math.floor(now / 1000) + 600),
    quoteExpiresAt: BigInt(Math.floor(now / 1000) + 500),
    verifier: signer.address,
  };
  const service = new WorldApprovalService(db, auth, provider, async () => context, {
    secret,
    verifierKey,
    attestationTtlSeconds: 300,
    issuer: "https://id.worldcoin.org",
    clientId: "app_test",
    now: () => now,
  });
  const link = async () => {
    const request = await service.start(token);
    await service.finish(token, { state: request.requestId, code: "link-code" });
  };
  return {
    db,
    service,
    auth,
    provider,
    context,
    token,
    requests,
    login,
    link,
    setSubject: (value: string) => {
      subject = value;
    },
    advance: (value: number) => {
      now += value;
    },
    identity: () => ({ subject, authenticatedAt: Math.floor(now / 1000) }),
  };
}

test("World linking and fresh approval produce the exact wallet-bound contract signature", async () => {
  const f = await fixture();
  await f.link();
  expect(f.service.isLinked(alice.address)).toBe(true);
  const request = await f.service.start(f.token, { vault, proposalId: 1n });
  expect(
    await f.service.finish(f.token, { state: request.requestId, code: "approval-code" }),
  ).toEqual({ status: "verified" });
  const result = f.service.status(f.token, request.requestId);
  expect(result.attestation?.amount).toBe("10000000");
  const attestation = result.attestation;
  if (!attestation) throw new Error("Missing attestation");
  expect(
    await verifyTypedData({
      ...approvalTypedData({ ...f.context, deadline: BigInt(attestation.deadline) }),
      address: signer.address,
      signature: attestation.signature as `0x${string}`,
    }),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain("linked-world-subject");
  expect(JSON.stringify(f.db.select().from(worldIdentities).all())).not.toContain(
    "linked-world-subject",
  );
  expect(
    f.db
      .select()
      .from(worldFlows)
      .all()
      .every((row, index) => row.verifier !== f.requests[index]?.verifier),
  ).toBe(true);
  await expect(
    f.service.finish(f.token, { state: request.requestId, code: "approval-code" }),
  ).rejects.toThrow("already used");
});

test("a different World subject cannot approve an already linked wallet", async () => {
  const f = await fixture();
  await f.link();
  const request = await f.service.start(f.token, { vault, proposalId: 1n });
  f.setSubject("different-person");
  expect(
    await f.service.finish(f.token, { state: request.requestId, code: "wrong-person" }),
  ).toEqual({ status: "failed" });
  expect(f.service.status(f.token, request.requestId)).toMatchObject({
    errorCode: "WORLD_IDENTITY_MISMATCH",
    attestation: null,
  });
});

test("cancelled and expired flows never return an approval signature", async () => {
  const f = await fixture();
  await f.link();
  const cancelled = await f.service.start(f.token, { vault, proposalId: 1n });
  await f.service.finish(f.token, { state: cancelled.requestId, error: "access_denied" });
  expect(f.service.status(f.token, cancelled.requestId)).toMatchObject({
    status: "cancelled",
    attestation: null,
  });
  const expired = await f.service.start(f.token, { vault, proposalId: 1n });
  f.advance(300_001);
  expect(f.service.status(f.token, expired.requestId)).toMatchObject({
    status: "expired",
    attestation: null,
  });
  await expect(
    f.service.finish(f.token, { state: expired.requestId, code: "late-code" }),
  ).rejects.toThrow("expired or was already used");
});

test("a request is bound to its original browser session and an existing World link", async () => {
  const f = await fixture();
  await expect(f.service.start(f.token, { vault, proposalId: 1n })).rejects.toThrow(
    "Link your World identity",
  );
  await f.link();
  const request = await f.service.start(f.token, { vault, proposalId: 1n });
  const otherSession = await f.login();
  await expect(
    f.service.finish(otherSession.token, { state: request.requestId, code: "code" }),
  ).rejects.toThrow("expired or was already used");
  expect(() => f.service.status(otherSession.token, request.requestId)).toThrow("not found");
});

test("cancelling during token exchange prevents a late callback from exposing an attestation", async () => {
  const f = await fixture();
  await f.link();
  const request = await f.service.start(f.token, { vault, proposalId: 1n });
  let complete: (value: VerifiedIdentity) => void = () => {
    throw new Error("Exchange did not start");
  };
  f.provider.exchange = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const finishing = f.service.finish(f.token, { state: request.requestId, code: "code" });
  f.service.cancel(f.token, request.requestId);
  complete(f.identity());
  await finishing;
  expect(f.service.status(f.token, request.requestId)).toMatchObject({
    status: "cancelled",
    attestation: null,
  });
});

test("the HTTP World callback returns to the web origin and polling exposes no identity token", async () => {
  const f = await fixture();
  const app = createApp({ auth: f.auth, world: f.service, db: f.db });
  const headers = { Cookie: `rickshare_session=${f.token}`, Origin: "http://localhost:5173" };
  const started = await app.request("/world/link/start", { method: "POST", headers });
  expect(started.status).toBe(200);
  const request = z.object({ requestId: z.string() }).parse(await started.json());
  const callback = await app.request(`/world/callback?state=${request.requestId}&code=link-code`, {
    headers,
  });
  expect(callback.status).toBe(302);
  expect(new URL(callback.headers.get("Location") ?? "").origin).toBe("http://localhost:5173");
  const status = await app.request(`/world/requests/${request.requestId}`, { headers });
  expect(await status.json()).toEqual({ status: "verified", errorCode: null, attestation: null });
});
