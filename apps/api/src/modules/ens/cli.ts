// Operator commands for trip names on ENS (Sepolia). Run from apps/api, e.g.:
//   bun run ens setup
//   bun run ens provision <vault> <endsAt ISO> "<trip name>" <address>=<display name> ...
//   bun run ens agent-check <vault> "<trip name>"
import { getAddress } from "viem";
import { config } from "../../config";
import { logger } from "../../lib/logger";
import { createSepoliaEnsChain } from "./chain";
import { createEnsService, ITINERARY_KEY } from "./service";

const { SEPOLIA_RPC_URL, ENS_ADMIN_PRIVATE_KEY, AGENT_PRIVATE_KEY, ENS_PARENT_NAME } = config;
if (!SEPOLIA_RPC_URL || !ENS_ADMIN_PRIVATE_KEY || !AGENT_PRIVATE_KEY || !ENS_PARENT_NAME) {
  logger.error(
    "ENS_NOT_CONFIGURED: set SEPOLIA_RPC_URL, ENS_ADMIN_PRIVATE_KEY, AGENT_PRIVATE_KEY and ENS_PARENT_NAME",
  );
  process.exit(1);
}

const ens = createEnsService({
  chain: createSepoliaEnsChain({
    rpcUrl: SEPOLIA_RPC_URL,
    adminKey: ENS_ADMIN_PRIVATE_KEY,
    agentKey: AGENT_PRIVATE_KEY,
  }),
  parentName: ENS_PARENT_NAME,
});

// Operator output, not app logging: these lines are the command's result.
const print = (line: string) =>
  process.stdout.write(`${line}
`);
const [command, ...args] = process.argv.slice(2);

if (command === "setup") {
  print(`ENS_PARENT_READY ${await ens.ensureParent()}`);
} else if (command === "provision") {
  const [vault, endsAt, name, ...members] = args;
  if (!vault || !endsAt || !name)
    throw new Error("provision <vault> <endsAt> <name> <address>=<display name>...");
  const names = await ens.provisionTrip({
    vault: getAddress(vault),
    endsAt: new Date(endsAt),
    name,
    members: members.map((pair) => {
      const [address = "", displayName = ""] = pair.split("=");
      return { address: getAddress(address), displayName };
    }),
  });
  print(`ENS_TRIP_READY ${JSON.stringify(names)}`);
} else if (command === "agent-check") {
  const [vault, name] = args;
  if (!vault || !name) throw new Error("agent-check <vault> <name>");
  const names = await ens.namesFor(getAddress(vault), name);
  for (const key of [ITINERARY_KEY, "description", "url", "avatar"])
    print(`ENS_AGENT_CAN_WRITE ${names.trip} ${key}=${await ens.agentCanWrite(names, key)}`);
} else {
  logger.error("Usage: bun run ens <setup | provision | agent-check> ...");
  process.exit(1);
}
