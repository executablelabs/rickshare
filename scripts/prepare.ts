import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { arcTestnet } from "@rickshare/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = new URL("../", import.meta.url);
const paths = [
  "scripts/demo.env",
  "packages/contracts/.env",
  "apps/api/.env",
  "apps/merchants/.env",
  "apps/web/.env",
];
const env = (values: Record<string, string>) =>
  `${Object.entries(values)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n")}\n`;

async function prepare() {
  for (const path of paths)
    if (await Bun.file(new URL(path, root)).exists()) throw new Error("ENV_FILES_ALREADY_EXIST");
  const roles = Object.fromEntries(
    [
      "deployer",
      "agent",
      "verifier",
      "merchant1",
      "merchant2",
      "merchant3",
      "member1",
      "member2",
      "member3",
    ].map((name) => {
      const key = generatePrivateKey();
      return [name, { key, address: privateKeyToAccount(key).address }];
    }),
  );
  const role = (name: string) => {
    const value = roles[name];
    if (!value) throw new Error("MISSING_GENERATED_ROLE");
    return value;
  };
  const session = randomBytes(32).toString("base64url");
  const merchantSecret = randomBytes(32).toString("base64url");
  const rpc = process.argv.includes("--local")
    ? "http://127.0.0.1:8545"
    : arcTestnet.rpcUrls.default.http[0];
  const publicRoles = {
    AGENT_ADDRESS: role("agent").address,
    VERIFIER_ADDRESS: role("verifier").address,
    MERCHANT_1_ADDRESS: role("merchant1").address,
    MERCHANT_2_ADDRESS: role("merchant2").address,
    MERCHANT_3_ADDRESS: role("merchant3").address,
  };
  const files: Record<string, string> = {
    "scripts/demo.env": env({
      ARC_RPC_URL: rpc,
      DEPLOYER_PRIVATE_KEY: role("deployer").key,
      ...publicRoles,
      DEMO_MEMBER_1_PRIVATE_KEY: role("member1").key,
      DEMO_MEMBER_2_PRIVATE_KEY: role("member2").key,
      DEMO_MEMBER_3_PRIVATE_KEY: role("member3").key,
      DEMO_DEPOSIT_USDC: "100",
      DEMO_TRIP_NAME: "India 26",
    }),
    "packages/contracts/.env": env({
      ARC_RPC_URL: rpc,
      DEPLOYER_PRIVATE_KEY: role("deployer").key,
      ...publicRoles,
    }),
    "apps/api/.env": env({
      ARC_RPC_URL: rpc,
      AGENT_PRIVATE_KEY: role("agent").key,
      VERIFIER_PRIVATE_KEY: role("verifier").key,
      SESSION_SECRET: session,
      MERCHANTS_API_SECRET: merchantSecret,
      WORLD_ISSUER: "https://id.worldcoin.org",
      WORLD_CLIENT_ID: "",
      WORLD_CLIENT_SECRET: "",
      WORLD_REDIRECT_URI: "http://localhost:8787/world/callback",
    }),
    "apps/merchants/.env": env({
      ARC_RPC_URL: rpc,
      MERCHANT_1_PRIVATE_KEY: role("merchant1").key,
      MERCHANT_2_PRIVATE_KEY: role("merchant2").key,
      MERCHANT_3_PRIVATE_KEY: role("merchant3").key,
      MERCHANTS_API_SECRET: merchantSecret,
      PUBLIC_URL: "http://localhost:8790",
    }),
    "apps/web/.env": env({ VITE_API_URL: "http://localhost:8787", VITE_ARC_RPC_URL: rpc }),
  };
  for (const [path, contents] of Object.entries(files))
    await writeFile(new URL(path, root), contents, { flag: "wx", mode: 0o600 });
  await mkdir(new URL(".local/", root), { recursive: true });
  const addresses = Object.fromEntries(
    Object.entries(roles).map(([name, value]) => [name, value.address]),
  );
  const record = {
    chainId: arcTestnet.id,
    addresses,
    faucet: "https://faucet.circle.com",
    note: "Public generated test-wallet addresses only. Private keys remain in ignored environment files.",
  };
  await Bun.write(
    new URL(".local/demo-wallets.json", root),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ ...record, setupDirectory: fileURLToPath(new URL(".local/", root)) }, null, 2)}\n`,
  );
}

try {
  await prepare();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "DEMO_PREPARATION_FAILED"}\n`,
  );
  process.exitCode = 1;
}
