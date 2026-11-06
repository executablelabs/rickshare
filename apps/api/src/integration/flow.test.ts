import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ARC_USDC, asHex, contractQuote, inviteTypedData } from "@rickshare/shared";
import { erc20Abi, tripVaultAbi } from "@rickshare/shared/abi";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";
import { createApp as createMerchantApp } from "../../../merchants/src/app";
import { createMerchantChain } from "../../../merchants/src/chain";
import { MerchantService } from "../../../merchants/src/service";
import { MerchantStore } from "../../../merchants/src/store";
import { createApp } from "../app";
import { createDatabase } from "../db/client";
import type { AgentModel } from "../modules/agent/service";
import { createApprovalReader } from "../modules/approvals/chain";
import type { WorldProvider } from "../modules/approvals/oidc";
import { WorldApprovalService } from "../modules/approvals/service";
import { AuthService } from "../modules/auth/service";
import { IndexerService } from "../modules/indexer/service";
import { createIndexSource } from "../modules/indexer/source";
import { createProposalChain } from "../modules/proposals/chain";
import { MerchantClient } from "../modules/proposals/merchants";
import { ProposalService } from "../modules/proposals/service";
import { createTripChain } from "../modules/trips/chain";
import { MoneyService } from "../modules/trips/money";
import { MoneyAction } from "../modules/trips/money-schemas";
import { TripService } from "../modules/trips/service";
import { createLocalChain } from "./local-chain";

let local: Awaited<ReturnType<typeof createLocalChain>>;
let database: ReturnType<typeof createDatabase>;
let merchantStore: MerchantStore;
beforeAll(async () => {
  local = await createLocalChain();
  database = createDatabase(":memory:");
  merchantStore = new MerchantStore(":memory:");
}, 120_000);

test("money preparation signs only member-owned actions and history paginates by chain order", async () => {
  const indexer = new IndexerService(database, createIndexSource(local.factory, local.client));
  await indexer.sync();
  const money = new MoneyService(
    database,
    createTripChain(local.factory, local.client),
    indexer,
    local.client,
  );
  const before = await money.balances(local.accounts.alice.address, local.vault);
  const amount = 1_000_000n;
  await local.mint(local.accounts.alice.address, amount);
  const prepared = await money.prepare(local.accounts.alice.address, local.vault, {
    action: "deposit",
    amount: amount.toString(),
  });
  expect(prepared.transactions).toHaveLength(2);
  for (const transaction of prepared.transactions) {
    expect(transaction.from).toBe(local.accounts.alice.address);
    expect(transaction.value).toBe("0x0");
    await local.receipt(
      await local.wallet(local.accounts.alice).sendTransaction({
        to: getAddress(transaction.to),
        data: asHex(transaction.data),
        value: 0n,
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      }),
    );
  }
  const after = await money.balances(local.accounts.alice.address, local.vault);
  expect(BigInt(after.own.available)).toBe(BigInt(before.own.available) + amount);
  const withdrawal = await money.prepare(local.accounts.alice.address, local.vault, {
    action: "withdraw",
    amount: amount.toString(),
  });
  const transaction = withdrawal.transactions[0];
  if (!transaction) throw new Error("No withdrawal transaction");
  await local.receipt(
    await local.wallet(local.accounts.alice).sendTransaction({
      to: getAddress(transaction.to),
      data: asHex(transaction.data),
      value: 0n,
    }),
  );
  const restored = await money.balances(local.accounts.alice.address, local.vault);
  expect(restored.own.available).toBe(before.own.available);
  expect(BigInt(restored.own.withdrawn)).toBe(BigInt(before.own.withdrawn) + amount);
  expect(
    MoneyAction.safeParse({ action: "withdraw", amount: "1", member: local.accounts.bob.address })
      .success,
  ).toBe(false);
  const first = await money.history(local.accounts.alice.address, local.vault, 2);
  expect(first.events).toHaveLength(2);
  if (!first.nextCursor) throw new Error("No history pagination cursor");
  const second = await money.history(
    local.accounts.alice.address,
    local.vault,
    2,
    first.nextCursor,
  );
  expect(
    second.events.every((event) => !first.events.some((previous) => previous.id === event.id)),
  ).toBe(true);
}, 120_000);

test("the authenticated chat runtime turns a scoped model quote into a real paid ticket", async () => {
  const fresh = await createLocalChain();
  const db = createDatabase(":memory:");
  const store = new MerchantStore(":memory:");
  try {
    const merchantSecret = "chat-integration-service-secret-32-characters";
    const merchant = new MerchantService(store, createMerchantChain(fresh.factory, fresh.rpc), {
      publicUrl: "http://merchant.local",
      accounts: new Map([["elephanta-walks", fresh.accounts.merchant]]),
    });
    const merchantApp = createMerchantApp({ service: merchant, apiSecret: merchantSecret });
    const client = new MerchantClient("http://merchant.local", merchantSecret, async (url, init) =>
      merchantApp.request(url, init),
    );
    const indexer = new IndexerService(db, createIndexSource(fresh.factory, fresh.client));
    await indexer.sync();
    const proposals = new ProposalService(
      db,
      createProposalChain(fresh.factory, `0x${"22".repeat(32)}`, fresh.client),
      client,
      () => indexer.sync(),
    );
    const auth = new AuthService(db, {
      origin: "http://localhost:5173",
      secret: "chat-integration-session-secret-32-characters",
      nonceTtlSeconds: 300,
      sessionTtlSeconds: 3600,
      verifySignature: (input) => fresh.client.verifyMessage(input),
    });
    const start = new Date(Date.now() + 3600_000).toISOString();
    let round = 0;
    let proposalId = "";
    const model: AgentModel = {
      createMessage: async (request) => {
        const tool = (name: string, input: unknown) => ({
          stop_reason: "tool_use" as const,
          content: [
            {
              type: "tool_use" as const,
              id: `tool-${round}`,
              name,
              input,
              caller: { type: "direct" as const },
            },
          ],
        });
        round += 1;
        if (round === 1) return tool("get_trip_state", {});
        if (round === 2)
          return tool("get_quote", {
            merchantId: "elephanta-walks",
            itemId: "elephanta-ferry-walk",
            quantity: 2,
            startsAt: start,
          });
        const last = request.messages.at(-1)?.content;
        const resultBlock = Array.isArray(last)
          ? last.find((block) => block.type === "tool_result")
          : undefined;
        const content = resultBlock && "content" in resultBlock ? resultBlock.content : undefined;
        if (round === 3) {
          if (typeof content !== "string") throw new Error("Missing scoped quote tool result");
          const parsed = z
            .object({ quoteId: z.string() })
            .parse(JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)));
          return tool("propose_purchase", {
            quoteId: parsed.quoteId,
            shares: [
              { member: fresh.accounts.alice.address, amount: "25000000" },
              { member: fresh.accounts.bob.address, amount: "25000000" },
            ],
          });
        }
        if (round === 4) {
          if (typeof content !== "string") throw new Error("Missing purchase tool result");
          proposalId = z.object({ proposalId: z.string() }).parse(JSON.parse(content)).proposalId;
          return tool("update_itinerary", {
            items: [
              {
                id: null,
                startsAt: start,
                title: "Elephanta Caves ferry and guided walk",
                location: "Mumbai",
                proposalId,
              },
            ],
          });
        }
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "I proposed the guided walk for the two of you.",
              citations: null,
            },
          ],
        };
      },
    };
    const app = createApp({ db, auth, indexer, proposals, merchants: client, model });
    const challenge = auth.issueNonce();
    const message = createSiweMessage({
      address: fresh.accounts.alice.address,
      chainId: 5042002,
      domain: "localhost:5173",
      uri: "http://localhost:5173",
      version: "1",
      nonce: challenge.nonce,
      issuedAt: new Date(),
    });
    const session = await auth.verify(
      message,
      await fresh.accounts.alice.signMessage({ message }),
      challenge.browserToken,
    );
    const headers = {
      Cookie: `rickshare_session=${session.token}`,
      Origin: "http://localhost:5173",
      "content-type": "application/json",
    };
    const response = await app.request(`/trips/${fresh.vault}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: randomUUID(),
        text: `Please get the guided walk for us at ${start}.`,
      }),
    });
    expect(response.status).toBe(200);
    expect(indexer.proposals(fresh.vault)[0]?.status).toBe("locked");
    expect(
      indexer.events(fresh.vault).some((event) => event.data.type === "itinerary.updated"),
    ).toBe(true);
    expect(
      indexer.events(fresh.vault).filter((event) => event.data.type === "chat.message"),
    ).toHaveLength(2);
    await merchant.sync();
    await indexer.sync();
    const ticket = await app.request(`/trips/${fresh.vault}/proposals/${proposalId}/ticket`, {
      headers,
    });
    expect(ticket.status).toBe(200);
    expect(indexer.proposals(fresh.vault)[0]?.status).toBe("fulfilled");
  } finally {
    store.close();
    db.$client.close();
    await fresh.close();
  }
}, 120_000);

test("wallet-signed creation and creator-authorized single-use invitations reach real vault membership", async () => {
  const indexer = new IndexerService(database, createIndexSource(local.factory, local.client));
  const chain = createTripChain(local.factory, local.client);
  const trips = new TripService(database, chain, indexer, {
    origin: "http://localhost:5173",
    digest: (token) => token,
  });
  const prepared = await trips.prepare(local.accounts.alice.address, {
    name: "Mumbai weekend",
    endsAt: new Date(Date.now() + 86400_000).toISOString(),
  });
  const createdHash = await local.wallet(local.accounts.alice).sendTransaction({
    to: prepared.transaction.to as `0x${string}`,
    data: asHex(prepared.transaction.data),
    value: 0n,
  });
  await local.receipt(createdHash);
  const confirmed = await trips.confirm(
    local.accounts.alice.address,
    prepared.creationId,
    createdHash,
  );
  const vault = confirmed.vaultAddress;
  expect(indexer.getTrip(vault).members).toHaveLength(1);
  const invite = await trips.createInvite(local.accounts.alice.address, vault);
  const token = new URL(invite.url).pathname.split("/").at(-1);
  if (!token) throw new Error("No invite token");
  const claimed = await trips.claim(local.accounts.bob.address, token);
  expect(claimed.status).toBe("claimed");
  await expect(trips.claim(local.accounts.carol.address, token)).rejects.toThrow(
    "already been claimed",
  );
  const signing = await trips.authorize(local.accounts.alice.address, vault, invite.inviteId);
  if (!signing.typedData) throw new Error("No invite data");
  const signature = await local.accounts.alice.signTypedData(
    inviteTypedData({
      chainId: 5042002,
      vaultAddress: vault,
      member: local.accounts.bob.address,
      deadline: BigInt(signing.typedData.message.deadline),
    }),
  );
  await trips.authorize(local.accounts.alice.address, vault, invite.inviteId, signature);
  const accepted = await trips.invite(local.accounts.bob.address, invite.inviteId);
  if (!accepted.transaction) throw new Error("No join transaction");
  const joined = await local
    .wallet(local.accounts.bob)
    .sendTransaction({ to: vault, data: asHex(accepted.transaction.data), value: 0n });
  await local.receipt(joined);
  await trips.confirmJoin(local.accounts.bob.address, invite.inviteId, joined);
  expect(indexer.getTrip(vault).members).toHaveLength(2);
  await trips.profile(local.accounts.bob.address, vault, "Bashy");
  expect(
    indexer.getTrip(vault).members.find((member) => member.address === local.accounts.bob.address)
      ?.displayName,
  ).toBe("Bashy");
  expect(
    (await trips.list(local.accounts.bob.address)).some((trip) => trip.id === vault.toLowerCase()),
  ).toBe(true);
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
