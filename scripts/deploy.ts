import { ARC_USDC, arcTestnet } from "@kitty/shared";
import { erc20Abi, tripFactoryAbi } from "@kitty/shared/abi";
import { createPublicClient, createWalletClient, encodeDeployData, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { readDeploymentConfig } from "./config";

async function deploy() {
  const config = readDeploymentConfig();
  const build = Bun.spawn(["forge", "build", "--root", "packages/contracts"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await build.exited) !== 0) throw new Error("CONTRACT_BUILD_FAILED");
  const artifact = z
    .object({ bytecode: z.object({ object: z.string().regex(/^0x[a-fA-F0-9]+$/) }) })
    .parse(
      await Bun.file(
        new URL("../packages/contracts/out/TripFactory.sol/TripFactory.json", import.meta.url),
      ).json(),
    );
  const transport = http(config.ARC_RPC_URL, { timeout: 15_000 });
  const client = createPublicClient({ chain: arcTestnet, transport });
  if ((await client.getChainId()) !== arcTestnet.id) throw new Error("WRONG_CHAIN");
  if (
    (await client.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: "decimals" })) !==
    6
  )
    throw new Error("WRONG_TOKEN_DECIMALS");
  const account = privateKeyToAccount(config.DEPLOYER_PRIVATE_KEY);
  if ((await client.getBalance({ address: account.address })) === 0n)
    throw new Error("DEPLOYER_NEEDS_ARC_GAS");
  const merchants = [
    config.MERCHANT_1_ADDRESS,
    config.MERCHANT_2_ADDRESS,
    config.MERCHANT_3_ADDRESS,
  ];
  const args = [ARC_USDC, config.AGENT_ADDRESS, config.VERIFIER_ADDRESS, merchants] as const;
  const bytecode = artifact.bytecode.object as Hex;
  const gas = await client.estimateGas({
    account,
    data: encodeDeployData({ abi: tripFactoryAbi, bytecode, args }),
  });
  const suggested = (await client.getGasPrice()) * 2n;
  const maxFeePerGas = suggested > 20_000_000_000n ? suggested : 20_000_000_000n;
  // Native balance is consulted only for Arc transaction gas, never vault accounting.
  if ((await client.getBalance({ address: account.address })) < gas * maxFeePerGas)
    throw new Error("DEPLOYER_NEEDS_ARC_GAS");
  const wallet = createWalletClient({ account, chain: arcTestnet, transport });
  const hash = await wallet.deployContract({
    abi: tripFactoryAbi,
    bytecode,
    args,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error("DEPLOYMENT_REVERTED");
  const record = {
    chainId: arcTestnet.id,
    factoryAddress: receipt.contractAddress,
    tokenAddress: ARC_USDC,
    deployerAddress: account.address,
    agentAddress: config.AGENT_ADDRESS,
    verifierAddress: config.VERIFIER_ADDRESS,
    merchantAddresses: merchants,
    deploymentBlock: receipt.blockNumber.toString(),
    transactionHash: hash,
  };
  await Bun.write(
    new URL("../packages/shared/src/deployments/arcTestnet.json", import.meta.url),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

try {
  await deploy();
} catch (error) {
  const code =
    error instanceof z.ZodError
      ? "INVALID_DEPLOYMENT_CONFIGURATION"
      : error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "DEPLOYMENT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
