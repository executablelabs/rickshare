import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ARC_USDC, arcTestnet, parseUsdc } from "@kitty/shared";
import { erc20Abi, tripFactoryAbi, tripVaultAbi } from "@kitty/shared/abi";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  type Hex,
  http,
  parseEther,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { readSeedConfig } from "./config";

const root = new URL("../", import.meta.url);
const Artifact = z.object({
  bytecode: z.object({ object: z.string().regex(/^0x[a-fA-F0-9]+$/) }),
  deployedBytecode: z.object({ object: z.string().regex(/^0x[a-fA-F0-9]+$/) }),
});

async function seed() {
  const config = readSeedConfig();
  const local = process.argv.includes("--local");
  const rpc = config.ARC_RPC_URL;
  const transport = http(rpc, { timeout: 15_000, retryCount: 0 });
  const client = createPublicClient({ chain: arcTestnet, transport });
  if ((await client.getChainId()) !== arcTestnet.id) throw new Error("WRONG_CHAIN");
  const deployer = privateKeyToAccount(config.DEPLOYER_PRIVATE_KEY);
  const people = [
    config.DEMO_MEMBER_1_PRIVATE_KEY,
    config.DEMO_MEMBER_2_PRIVATE_KEY,
    config.DEMO_MEMBER_3_PRIVATE_KEY,
  ].map((key) => privateKeyToAccount(key));
  if (new Set(people.map((person) => person.address)).size !== 3)
    throw new Error("DEMO_MEMBERS_MUST_BE_DISTINCT");
  const roles = [
    config.AGENT_ADDRESS,
    config.MERCHANT_1_ADDRESS,
    config.MERCHANT_2_ADDRESS,
    config.MERCHANT_3_ADDRESS,
  ];
  const fees = async () => {
    const suggested = (await client.getGasPrice()) * 2n;
    return {
      maxFeePerGas: suggested > 20_000_000_000n ? suggested : 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    };
  };
  const wallet = createWalletClient({ account: deployer, chain: arcTestnet, transport });
  const receipt = async (hash: Hex) => {
    const result = await client.waitForTransactionReceipt({ hash });
    if (result.status !== "success") throw new Error("SEED_TRANSACTION_REVERTED");
    return result;
  };
  const deposit = parseUsdc(config.DEMO_DEPOSIT_USDC);
  if (deposit <= 0n) throw new Error("DEMO_DEPOSIT_MUST_BE_POSITIVE");
  let factory = config.TRIP_FACTORY_ADDRESS;
  let deploymentBlock = 0n;
  if (local) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpc).hostname))
      throw new Error("LOCAL_MODE_REQUIRES_LOOPBACK_RPC");
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }),
    });
    const version = z.object({ result: z.string() }).parse(await response.json()).result;
    if (!version.toLowerCase().includes("anvil")) throw new Error("LOCAL_MODE_REQUIRES_ANVIL");
    const build = Bun.spawn(["forge", "build", "--root", "packages/contracts"], {
      cwd: fileURLToPath(root),
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await build.exited) !== 0) throw new Error("CONTRACT_BUILD_FAILED");
    const tokenArtifact = Artifact.parse(
      await Bun.file(new URL("packages/contracts/out/MockUSDC.sol/MockUSDC.json", root)).json(),
    );
    const test = createTestClient({ mode: "anvil", chain: arcTestnet, transport });
    await test.setCode({
      address: ARC_USDC,
      bytecode: tokenArtifact.deployedBytecode.object as Hex,
    });
    for (const address of [deployer.address, ...people.map((person) => person.address), ...roles])
      await test.setBalance({ address, value: parseEther("1000") });
    const mintAbi = [
      {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      },
    ] as const;
    await receipt(
      await wallet.writeContract({
        address: ARC_USDC,
        abi: mintAbi,
        functionName: "mint",
        args: [deployer.address, deposit * 10n + 100_000_000n],
        ...(await fees()),
      }),
    );
    if (!factory) {
      const artifact = Artifact.parse(
        await Bun.file(
          new URL("packages/contracts/out/TripFactory.sol/TripFactory.json", root),
        ).json(),
      );
      const deployed = await receipt(
        await wallet.deployContract({
          abi: tripFactoryAbi,
          bytecode: artifact.bytecode.object as Hex,
          args: [
            ARC_USDC,
            config.AGENT_ADDRESS,
            config.VERIFIER_ADDRESS,
            [config.MERCHANT_1_ADDRESS, config.MERCHANT_2_ADDRESS, config.MERCHANT_3_ADDRESS],
          ],
          ...(await fees()),
        }),
      );
      if (!deployed.contractAddress) throw new Error("FACTORY_DEPLOYMENT_MISSING");
      factory = getAddress(deployed.contractAddress);
      deploymentBlock = deployed.blockNumber;
    }
  } else if (!factory) {
    const deploy = Bun.spawn(["bun", "run", "contracts:deploy"], {
      cwd: fileURLToPath(root),
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await deploy.exited) !== 0) throw new Error("FACTORY_DEPLOYMENT_REQUIRED");
    const record = z
      .object({ factoryAddress: z.string(), deploymentBlock: z.string() })
      .parse(
        await Bun.file(new URL("packages/shared/src/deployments/arcTestnet.json", root)).json(),
      );
    factory = getAddress(record.factoryAddress);
    deploymentBlock = BigInt(record.deploymentBlock);
  }
  if (!factory) throw new Error("FACTORY_DEPLOYMENT_REQUIRED");
  const [token, agent, verifier] = await Promise.all([
    client.readContract({ address: factory, abi: tripFactoryAbi, functionName: "token" }),
    client.readContract({ address: factory, abi: tripFactoryAbi, functionName: "agent" }),
    client.readContract({ address: factory, abi: tripFactoryAbi, functionName: "verifier" }),
  ]);
  if (
    token.toLowerCase() !== ARC_USDC.toLowerCase() ||
    agent.toLowerCase() !== config.AGENT_ADDRESS.toLowerCase() ||
    verifier.toLowerCase() !== config.VERIFIER_ADDRESS.toLowerCase()
  )
    throw new Error("FACTORY_CONFIGURATION_MISMATCH");
  const gasReserve = 1_000_000n;
  const targets = [
    ...people.map((person) => ({ address: person.address, target: deposit + gasReserve })),
    ...roles.map((address) => ({ address, target: gasReserve })),
  ];
  const deficits = await Promise.all(
    targets.map(async (target) => {
      const balance = await client.readContract({
        address: ARC_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [target.address],
      });
      return {
        address: target.address,
        amount: balance < target.target ? target.target - balance : 0n,
      };
    }),
  );
  const required = deficits.reduce((sum, target) => sum + target.amount, gasReserve);
  const available = await client.readContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer.address],
  });
  if (available < required) {
    process.stdout.write(
      `${JSON.stringify({ code: "SEED_NEEDS_TESTNET_FUNDS", deployer: deployer.address, requiredBaseUnits: required.toString(), availableBaseUnits: available.toString() })}\n`,
    );
    throw new Error("SEED_NEEDS_TESTNET_FUNDS");
  }
  for (const target of deficits)
    if (target.amount > 0n)
      await receipt(
        await wallet.writeContract({
          address: ARC_USDC,
          abi: erc20Abi,
          functionName: "transfer",
          args: [target.address, target.amount],
          ...(await fees()),
        }),
      );
  const creator = people[0];
  if (!creator) throw new Error("DEMO_CREATOR_MISSING");
  const creatorWallet = createWalletClient({ account: creator, chain: arcTestnet, transport });
  const endsAt = (await client.getBlock()).timestamp + 7n * 86400n;
  const created = await receipt(
    await creatorWallet.writeContract({
      address: factory,
      abi: tripFactoryAbi,
      functionName: "createTrip",
      args: [people.map((person) => person.address), endsAt],
      ...(await fees()),
    }),
  );
  const event = parseEventLogs({
    abi: tripFactoryAbi,
    eventName: "TripCreated",
    logs: created.logs,
    strict: true,
  })[0];
  if (!event) throw new Error("TRIP_CREATION_MISSING");
  const vault = getAddress(event.args.vault);
  for (const person of people) {
    const member = createWalletClient({ account: person, chain: arcTestnet, transport });
    await receipt(
      await member.writeContract({
        address: ARC_USDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, deposit],
        ...(await fees()),
      }),
    );
    await receipt(
      await member.writeContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "deposit",
        args: [deposit],
        ...(await fees()),
      }),
    );
    await receipt(
      await member.writeContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "setPolicy",
        args: [deposit / 4n, deposit / 2n],
        ...(await fees()),
      }),
    );
  }
  await mkdir(new URL(".local/", root), { recursive: true });
  const dataDirectory = new URL(local ? `.local/runs/${randomUUID()}/` : ".local/live/", root);
  await mkdir(dataDirectory, { recursive: true });
  const runtime = {
    ARC_RPC_URL: rpc,
    VITE_ARC_RPC_URL: rpc,
    TRIP_FACTORY_ADDRESS: factory,
    ARC_START_BLOCK: deploymentBlock.toString(),
    DATABASE_PATH: fileURLToPath(new URL("api.sqlite", dataDirectory)).replaceAll("\\", "/"),
    MERCHANT_DATABASE_PATH: fileURLToPath(new URL("merchants.sqlite", dataDirectory)).replaceAll(
      "\\",
      "/",
    ),
  };
  await Bun.write(
    new URL(".local/runtime.env", root),
    `${Object.entries(runtime)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n")}\n`,
  );
  const { createDatabase } = await import("../apps/api/src/db/client");
  const { tripMetadata } = await import("../apps/api/src/db/schema");
  const database = createDatabase(runtime.DATABASE_PATH);
  database
    .insert(tripMetadata)
    .values({ tripId: vault.toLowerCase(), name: config.DEMO_TRIP_NAME })
    .onConflictDoUpdate({ target: tripMetadata.tripId, set: { name: config.DEMO_TRIP_NAME } })
    .run();
  database.$client.close();
  const record = {
    mode: local ? "local-anvil" : "arc-testnet",
    chainId: arcTestnet.id,
    factoryAddress: factory,
    vaultAddress: vault,
    memberAddresses: people.map((person) => person.address),
    depositBaseUnits: deposit.toString(),
    endsAt: endsAt.toString(),
    tripUrl: `http://localhost:5173/trips/${vault.toLowerCase()}/plan`,
  };
  await Bun.write(new URL(".local/demo-state.json", root), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

try {
  await seed();
} catch (error) {
  const code =
    error instanceof z.ZodError
      ? "INVALID_DEMO_CONFIGURATION"
      : error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "DEMO_SEED_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
