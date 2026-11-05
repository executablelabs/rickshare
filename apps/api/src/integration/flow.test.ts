import { afterAll, beforeAll, expect, test } from "bun:test";
import { ARC_USDC, contractQuote } from "@rickshare/shared";
import { erc20Abi, tripVaultAbi } from "@rickshare/shared/abi";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp as createMerchantApp } from "../../../merchants/src/app";
import { createMerchantChain } from "../../../merchants/src/chain";
import { MerchantService } from "../../../merchants/src/service";
import { MerchantStore } from "../../../merchants/src/store";
import { createDatabase } from "../db/client";
import { createApprovalReader } from "../modules/approvals/chain";
import type { WorldProvider } from "../modules/approvals/oidc";
import { WorldApprovalService } from "../modules/approvals/service";
import { AuthService } from "../modules/auth/service";
import { IndexerService } from "../modules/indexer/service";
import { createIndexSource } from "../modules/indexer/source";
import { createProposalChain } from "../modules/proposals/chain";
import { MerchantClient } from "../modules/proposals/merchants";
import { ProposalService } from "../modules/proposals/service";
import { createLocalChain } from "./local-chain";

let local: Awaited<ReturnType<typeof createLocalChain>>;
let database: ReturnType<typeof createDatabase>;
let merchantStore: MerchantStore;
beforeAll(async () => {
  local = await createLocalChain();
  database = createDatabase(":memory:");
  merchantStore = new MerchantStore(":memory:");
}, 120_000);
afterAll(async () => {
  merchantStore?.close();
  database?.$client.close();
  if (local) await local.close();
});

test("real contracts, signatures, projections, delivery, World attestations and refunds work together", async () => {
  const accounts = local.accounts;
  const merchantSecret = "integration-service-secret-at-least-32-chars";
  const merchants = new MerchantService(
    merchantStore,
    createMerchantChain(local.factory, local.rpc),
    {
      publicUrl: "http://merchant.local",
      accounts: new Map([["elephanta-walks", accounts.merchant]]),
    },
  );
  const merchantApp = createMerchantApp({ service: merchants, apiSecret: merchantSecret });
  const merchantClient = new MerchantClient(
    "http://merchant.local",
    merchantSecret,
    async (url, init) => merchantApp.request(url, init),
  );
  const indexer = new IndexerService(database, createIndexSource(local.factory, local.client));
  const proposals = new ProposalService(
    database,
    createProposalChain(local.factory, `0x${"22".repeat(32)}`, local.client),
    merchantClient,
    () => indexer.sync(),
  );
  await indexer.sync();
  expect(indexer.getTrip(local.vault).members).toHaveLength(3);
  const quote = await merchantClient.quote({
    merchantId: "elephanta-walks",
    itemId: "elephanta-ferry-walk",
    vaultAddress: local.vault,
    quantity: 2,
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const onchainDigest = await local.client.readContract({
    address: local.vault,
    abi: tripVaultAbi,
    functionName: "quoteDigest",
    args: [contractQuote(quote)],
  });
  expect(onchainDigest).toBe(quote.quoteHash as `0x${string}`);
  const submitted = await proposals.submitProposal({
    tripId: local.vault,
    quote,
    shares: [
      { member: accounts.alice.address, amount: 25_000_000n },
      { member: accounts.bob.address, amount: 25_000_000n },
    ],
  });
  await indexer.sync();
  expect(indexer.proposals(local.vault)[0]?.status).toBe("locked");
  await merchants.sync();
  await indexer.sync();
  expect(indexer.proposals(local.vault)[0]?.status).toBe("fulfilled");
  expect(
    await local.client.readContract({
      address: ARC_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accounts.merchant.address],
    }),
  ).toBe(50_000_000n);
  expect(
    (await proposals.ticket(local.vault, submitted.proposalId, accounts.alice.address)).holders,
  ).toEqual([accounts.alice.address, accounts.bob.address]);
  await expect(
    proposals.ticket(local.vault, submitted.proposalId, accounts.carol.address),
  ).rejects.toThrow("does not include you");
  const auth = new AuthService(database, {
    origin: "http://localhost:5173",
    secret: "integration-session-secret-at-least-32-chars",
    nonceTtlSeconds: 300,
    sessionTtlSeconds: 3600,
    verifySignature: (input) => local.client.verifyMessage(input),
  });
  const login = async (account: typeof accounts.alice) => {
    const challenge = auth.issueNonce();
    const message = createSiweMessage({
      address: account.address,
      chainId: 5042002,
      domain: "localhost:5173",
      uri: "http://localhost:5173",
      version: "1",
      nonce: challenge.nonce,
      issuedAt: new Date(),
    });
    return auth.verify(message, await account.signMessage({ message }), challenge.browserToken);
  };
  // This injected provider exists only in the test; production always verifies World JWKS tokens.
  const provider: WorldProvider = {
    authorization: async () => "https://id.worldcoin.org/authorize",
    exchange: async ({ code }) => ({
      subject: code,
      authenticatedAt: Math.floor(Date.now() / 1000),
    }),
  };
  const world = new WorldApprovalService(
    database,
    auth,
    provider,
    createApprovalReader(local.factory, local.client),
    {
      secret: "integration-session-secret-at-least-32-chars",
      verifierKey: `0x${"33".repeat(32)}`,
      attestationTtlSeconds: 300,
      issuer: "https://id.worldcoin.org",
      clientId: "app_integration",
    },
  );
  const secondQuote = await merchantClient.quote({
    merchantId: "elephanta-walks",
    itemId: "elephanta-ferry-walk",
    vaultAddress: local.vault,
    quantity: 3,
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const second = await proposals.submitProposal({
    tripId: local.vault,
    quote: secondQuote,
    shares: [
      { member: accounts.alice.address, amount: 37_500_000n },
      { member: accounts.bob.address, amount: 37_500_000n },
    ],
  });
  for (const [name, account] of [
    ["alice-world", accounts.alice],
    ["bob-world", accounts.bob],
  ] as const) {
    const { token } = await login(account);
    const link = await world.start(token);
    expect(await world.finish(token, { state: link.requestId, code: name })).toEqual({
      status: "verified",
    });
    const start = await world.start(token, {
      vault: local.vault,
      proposalId: BigInt(second.proposalId),
    });
    expect(await world.finish(token, { state: start.requestId, code: name })).toEqual({
      status: "verified",
    });
    const attestation = world.status(token, start.requestId).attestation;
    if (!attestation) throw new Error("No local approval attestation");
    await local.receipt(
      await local.wallet(account).writeContract({
        address: local.vault,
        abi: tripVaultAbi,
        functionName: "approve",
        args: [
          BigInt(second.proposalId),
          BigInt(attestation.nonce),
          BigInt(attestation.deadline),
          attestation.signature as `0x${string}`,
        ],
      }),
    );
  }
  const locked = await local.client.readContract({
    address: local.vault,
    abi: tripVaultAbi,
    functionName: "getProposal",
    args: [BigInt(second.proposalId)],
  });
  expect(locked.status).toBe(1);
  expect(
    (
      await local.client.readContract({
        address: local.vault,
        abi: tripVaultAbi,
        functionName: "getBalance",
        args: [accounts.carol.address],
      })
    ).available,
  ).toBe(100_000_000n);
  await local.test.setNextBlockTimestamp({ timestamp: locked.deadline });
  await local.test.mine({ blocks: 1 });
  await local.receipt(
    await local.wallet(accounts.carol).writeContract({
      address: local.vault,
      abi: tripVaultAbi,
      functionName: "refund",
      args: [BigInt(second.proposalId)],
    }),
  );
  await indexer.sync();
  expect(
    indexer.proposals(local.vault).find((entry) => entry.id === second.proposalId)?.status,
  ).toBe("refunded");
  expect(
    (
      await local.client.readContract({
        address: local.vault,
        abi: tripVaultAbi,
        functionName: "getBalance",
        args: [accounts.alice.address],
      })
    ).available,
  ).toBe(75_000_000n);
  await local.receipt(
    await local.wallet(accounts.alice).writeContract({
      address: local.vault,
      abi: tripVaultAbi,
      functionName: "withdraw",
      args: [75_000_000n],
    }),
  );
  expect(
    (
      await local.client.readContract({
        address: local.vault,
        abi: tripVaultAbi,
        functionName: "getBalance",
        args: [accounts.bob.address],
      })
    ).available,
  ).toBe(75_000_000n);
  const restart = new IndexerService(database, createIndexSource(local.factory, local.client));
  await restart.sync();
  const count = restart.events(local.vault).length;
  await restart.sync();
  expect(restart.events(local.vault)).toHaveLength(count);
  expect(privateKeyToAccount(`0x${"33".repeat(32)}`).address).toBe(accounts.verifier.address);
}, 120_000);
