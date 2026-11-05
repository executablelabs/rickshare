import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { ARC_USDC, arcTestnet } from "@rickshare/shared";
import { erc20Abi, tripFactoryAbi, tripVaultAbi } from "@rickshare/shared/abi";
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

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port available");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export async function createLocalChain() {
  const root = new URL("../../../../", import.meta.url);
  const build = Bun.spawn(
    ["forge", "build", "--root", fileURLToPath(new URL("packages/contracts", root))],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await build.exited) !== 0)
    throw new Error(`Contract build failed: ${await new Response(build.stderr).text()}`);
  const port = await freePort();
  const node = Bun.spawn(
    ["anvil", "--silent", "--host", "127.0.0.1", "--port", String(port), "--chain-id", "5042002"],
    { stdout: "ignore", stderr: "pipe" },
  );
  const rpc = `http://127.0.0.1:${port}`;
  const transport = http(rpc, { timeout: 1000, retryCount: 0 });
  const client = createPublicClient({ chain: arcTestnet, transport, pollingInterval: 10 });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await client.getChainId()) === arcTestnet.id;
    } catch {
      ready = false;
    }
    if (ready) break;
    await Bun.sleep(50);
  }
  if (!ready) {
    node.kill();
    throw new Error("Local Anvil did not start");
  }
  try {
    const test = createTestClient({ chain: arcTestnet, mode: "anvil", transport });
    const accounts = {
      deployer: privateKeyToAccount(`0x${"11".repeat(32)}`),
      agent: privateKeyToAccount(`0x${"22".repeat(32)}`),
      verifier: privateKeyToAccount(`0x${"33".repeat(32)}`),
      merchant: privateKeyToAccount(`0x${"44".repeat(32)}`),
      alice: privateKeyToAccount(`0x${"55".repeat(32)}`),
      bob: privateKeyToAccount(`0x${"66".repeat(32)}`),
      carol: privateKeyToAccount(`0x${"77".repeat(32)}`),
    };
    for (const account of Object.values(accounts))
      await test.setBalance({ address: account.address, value: parseEther("1000") });
    const artifactSchema = z.object({
      bytecode: z.object({ object: z.string() }),
      deployedBytecode: z.object({ object: z.string() }),
    });
    const artifact = async (name: string) =>
      artifactSchema.parse(
        await Bun.file(new URL(`packages/contracts/out/${name}.sol/${name}.json`, root)).json(),
      );
    await test.setCode({
      address: ARC_USDC,
      bytecode: (await artifact("MockUSDC")).deployedBytecode.object as Hex,
    });
    const wallet = (account: typeof accounts.alice) =>
      createWalletClient({ account, chain: arcTestnet, transport });
    const receipt = async (hash: Hex) => {
      const mined = await client.waitForTransactionReceipt({ hash });
      if (mined.status !== "success") throw new Error("Local transaction reverted");
      return mined;
    };
    const deployed = await receipt(
      await wallet(accounts.deployer).deployContract({
        abi: tripFactoryAbi,
        bytecode: (await artifact("TripFactory")).bytecode.object as Hex,
        args: [
          ARC_USDC,
          accounts.agent.address,
          accounts.verifier.address,
          [accounts.merchant.address],
        ],
      }),
    );
    if (!deployed.contractAddress) throw new Error("No local factory address");
    const factory = getAddress(deployed.contractAddress);
    const end = (await client.getBlock()).timestamp + 7n * 86400n;
    const created = await receipt(
      await wallet(accounts.alice).writeContract({
        address: factory,
        abi: tripFactoryAbi,
        functionName: "createTrip",
        args: [[accounts.alice.address, accounts.bob.address, accounts.carol.address], end],
      }),
    );
    const event = parseEventLogs({
      abi: tripFactoryAbi,
      eventName: "TripCreated",
      logs: created.logs,
      strict: true,
    })[0];
    if (!event) throw new Error("No local trip event");
    const vault = getAddress(event.args.vault);
    const mint = [
      {
        type: "function",
        name: "mint",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ] as const;
    for (const person of [accounts.alice, accounts.bob, accounts.carol]) {
      await receipt(
        await wallet(accounts.deployer).writeContract({
          address: ARC_USDC,
          abi: mint,
          functionName: "mint",
          args: [person.address, 100_000_000n],
        }),
      );
      await receipt(
        await wallet(person).writeContract({
          address: ARC_USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [vault, 100_000_000n],
        }),
      );
      await receipt(
        await wallet(person).writeContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "deposit",
          args: [100_000_000n],
        }),
      );
      await receipt(
        await wallet(person).writeContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "setPolicy",
          args: [25_000_000n, 50_000_000n],
        }),
      );
    }
    return {
      rpc,
      client,
      test,
      accounts,
      factory,
      vault,
      wallet,
      receipt,
      close: async () => {
        node.kill();
        await node.exited;
      },
    };
  } catch (error) {
    node.kill();
    await node.exited;
    throw error;
  }
}
