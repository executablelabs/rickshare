import { expect, test } from "bun:test";
import { computeRpSignatureMessage } from "@worldcoin/idkit-server";
import { getAddress, hexToBytes, toHex, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ApprovalContext } from "./chain";
import { WorldHumanProofProvider, worldSignalHash } from "./proof";

const key = `0x${"ab".repeat(32)}` as const;
const context: ApprovalContext = {
  chainId: 5042002,
  vaultAddress: getAddress(`0x${"12".repeat(20)}`),
  member: getAddress(`0x${"34".repeat(20)}`),
  proposalId: 1n,
  amount: 42000000n,
  nonce: 0n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
  quoteExpiresAt: BigInt(Math.floor(Date.now() / 1000) + 500),
  verifier: privateKeyToAccount(key).address,
};

test("signal hashes match World's published hash-to-field vector", () => {
  expect(worldSignalHash("")).toBe(
    "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
  );
  expect(worldSignalHash("test_signal")).toBe(
    "0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed",
  );
});

function fixture(verification?: unknown) {
  const calls: { url: string; input: unknown }[] = [];
  const provider = new WorldHumanProofProvider({
    appId: "app_test",
    rpId: "rp_test",
    signingKey: key,
    fetcher: async (url, init) => {
      calls.push({ url, input: JSON.parse(String(init?.body)) });
      return Response.json(
        verification ?? {
          success: true,
          environment: "production",
          results: [{ identifier: "proof_of_human", success: true, nullifier: "0x01" }],
        },
      );
    },
  });
  const challenge = provider.challenge(context, "request-1", Date.now() + 300_000);
  const proof = {
    protocol_version: "4.0",
    environment: "production",
    action: challenge.action,
    nonce: challenge.rpContext.nonce,
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        signal_hash: worldSignalHash(challenge.signal),
        nullifier: "0x01",
        expires_at_min: Math.floor(Date.now() / 1000) + 600,
        proof: ["0x01", "0x02", "0x03", "0x04", "0x05"],
      },
    ],
  };
  return { provider, challenge, proof, calls };
}

test("RP request signatures bind the exact approval action and expose no signing key", async () => {
  const f = fixture();
  const rp = f.challenge.rpContext;
  expect(
    await verifyMessage({
      address: privateKeyToAccount(key).address,
      message: {
        raw: toHex(
          computeRpSignatureMessage(
            hexToBytes(rp.nonce as `0x${string}`),
            rp.created_at,
            rp.expires_at,
            f.challenge.action,
          ),
        ),
      },
      signature: rp.signature as `0x${string}`,
    }),
  ).toBe(true);
  expect(JSON.stringify(f.challenge)).not.toContain(key);
  expect(
    f.provider.challenge({ ...context, amount: 1n }, "request-1", Date.now() + 300_000).action,
  ).not.toBe(f.challenge.action);
});

test("verification pins the RP and production environment, preserves the proof, and normalizes nullifiers", async () => {
  const f = fixture();
  const first = await f.provider.verify(f.proof, f.challenge);
  const padded = structuredClone(f.proof);
  if (!padded.responses[0]) throw new Error("No credential");
  padded.responses[0].nullifier = "0x0001";
  expect(await f.provider.verify(padded, f.challenge)).toBe(first);
  expect(f.calls[0]).toEqual({
    url: "https://developer.world.org/api/v4/verify/rp_test",
    input: f.proof,
  });
});

test("tampered action, nonce, wallet signal, environment and session proofs are rejected before verification", async () => {
  const f = fixture();
  const credential = f.proof.responses[0];
  if (!credential) throw new Error("No credential");
  for (const proof of [
    { ...f.proof, environment: "staging" },
    { ...f.proof, nonce: "another-nonce" },
    { ...f.proof, action: `rickshare:approve:${"a".repeat(64)}` },
    { ...f.proof, responses: [{ ...credential, signal_hash: "0x0" }] },
    { ...f.proof, responses: [credential, credential] },
    { ...f.proof, session_id: "session_fake" },
    { ...f.proof, responses: [{ ...credential, issuer_schema_id: 11 }] },
    { ...f.proof, responses: [{ ...credential, session_nullifier: ["0x1", "0x2"] }] },
  ])
    await expect(f.provider.verify(proof, f.challenge)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test("HTTP 200 alone, failed credentials, wrong environment and mismatched credential results do not authorize", async () => {
  for (const verification of [
    {
      success: true,
      environment: "staging",
      results: [{ identifier: "proof_of_human", success: true }],
    },
    {
      success: true,
      environment: "production",
      results: [{ identifier: "proof_of_human", success: false }],
    },
    { success: true, environment: "production", results: [{ identifier: "other", success: true }] },
    {
      success: true,
      environment: "production",
      results: [{ identifier: "proof_of_human", success: true, nullifier: "0x02" }],
    },
    { success: true, results: [] },
  ]) {
    const f = fixture(verification);
    await expect(f.provider.verify(f.proof, f.challenge)).rejects.toMatchObject({
      code: "WORLD_PROOF_REJECTED",
    });
  }
});
