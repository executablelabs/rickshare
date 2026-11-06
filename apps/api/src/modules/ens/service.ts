import {
  type Abi,
  type Address,
  type ContractFunctionName,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  toHex,
  zeroAddress,
} from "viem";
import { AppError } from "../../lib/errors";
import {
  ADMIN_REGISTRY_ROLES,
  ADMIN_RESOLVER_ROLES,
  ENS_SEPOLIA,
  ETH_COIN_TYPE,
  factoryAbi,
  RESOLVER_ROLES,
  registryAbi,
  resolverAbi,
} from "./contracts";
import { AGENT_LABEL, dnsEncode, memberLabels, tripLabel } from "./names";

/** The text record the agent may write, and the only one. */
export const ITINERARY_KEY = "itinerary";

/** The chain operations ENS needs; tests replace it with an in-memory fake. */
export interface EnsChain {
  admin: Address;
  agent: Address;
  call(to: Address, data: Hex, from?: Address): Promise<Hex>;
  hasCode(address: Address): Promise<boolean>;
  /** Sends a transaction as the admin or the agent and resolves once it succeeded. */
  send(signer: "admin" | "agent", to: Address, data: Hex): Promise<Hex>;
}

export interface TripNamesInput {
  vault: Address;
  name: string;
  endsAt: Date;
  label?: string;
  members: Array<{ address: Address; displayName: string; label?: string }>;
}

export interface TripNames {
  trip: string;
  agent: string;
  members: Record<Address, string>;
  registry: Address;
  resolver: Address;
}

export function createEnsService({ chain, parentName }: { chain: EnsChain; parentName: string }) {
  const parentLabel = /^([a-z0-9-]+)\.eth$/.exec(parentName)?.[1];
  if (!parentLabel)
    throw new AppError(
      "ENS_NOT_CONFIGURED",
      "ENS_PARENT_NAME must be a name like rickshare.eth.",
      503,
    );

  async function read<const abi extends Abi, name extends ContractFunctionName<abi, "view">>(
    to: Address,
    abi: abi,
    functionName: name,
    args: readonly unknown[],
  ) {
    const data = encodeFunctionData({ abi, functionName, args } as never);
    const result = await chain.call(to, data);
    return decodeFunctionResult({ abi, functionName, data: result } as never) as unknown;
  }

  const salt = (kind: string, id: string) => BigInt(keccak256(toHex(`rickshare:${kind}:${id}`)));

  const predict = async (proxySalt: bigint) =>
    getAddress(
      (await read(ENS_SEPOLIA.verifiableFactory, factoryAbi, "predictProxyAddress", [
        chain.admin,
        proxySalt,
      ])) as Address,
    );

  /** Deploys a proxy unless one already sits at its predicted address, so reruns are safe. */
  async function ensureProxy(implementation: Address, proxySalt: bigint, init: Hex) {
    const address = await predict(proxySalt);
    if (await chain.hasCode(address)) return { address, created: false };
    await chain.send(
      "admin",
      ENS_SEPOLIA.verifiableFactory,
      encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [implementation, proxySalt, init],
      }),
    );
    return { address, created: true };
  }

  const ownerOf = async (registry: Address, label: string) =>
    getAddress((await read(registry, registryAbi, "findOwner", [label])) as Address);

  async function register(
    registry: Address,
    label: string,
    owner: Address,
    resolver: Address,
    expiry: bigint,
  ) {
    const current = await ownerOf(registry, label);
    if (current === owner) return false;
    if (current !== zeroAddress)
      throw new AppError("ENS_LABEL_TAKEN", `The name ${label} is already taken.`, 409);
    await chain.send(
      "admin",
      registry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "register",
        // An empty role bitmap leaves the owner unable to move or repoint the name.
        args: [label, owner, zeroAddress, resolver, 0n, expiry],
      }),
    );
    return true;
  }

  async function parentRegistry() {
    const address = await predict(salt("parent", parentName));
    if (!(await chain.hasCode(address)))
      throw new AppError("ENS_NOT_SET_UP", "Run the ENS setup before creating trip names.", 503);
    return address;
  }

  return {
    /**
     * One-time setup: a registry for subnames of the parent name, controlled by the ENS admin,
     * attached to the parent name in the .eth registry.
     */
    async ensureParent() {
      const registry = await ensureProxy(
        ENS_SEPOLIA.userRegistryImpl,
        salt("parent", parentName),
        encodeFunctionData({
          abi: registryAbi,
          functionName: "initialize",
          args: [[{ account: chain.admin, roleBitmap: ADMIN_REGISTRY_ROLES }]],
        }),
      );
      const [parent, label] = (await read(registry.address, registryAbi, "getParent", [])) as [
        Address,
        string,
      ];
      if (getAddress(parent) !== getAddress(ENS_SEPOLIA.ethRegistry) || label !== parentLabel)
        await chain.send(
          "admin",
          registry.address,
          encodeFunctionData({
            abi: registryAbi,
            functionName: "setParent",
            args: [ENS_SEPOLIA.ethRegistry, parentLabel],
          }),
        );
      const attached = getAddress(
        (await read(ENS_SEPOLIA.ethRegistry, registryAbi, "getSubregistry", [
          parentLabel,
        ])) as Address,
      );
      if (attached !== registry.address) {
        const tokenId = (await read(ENS_SEPOLIA.ethRegistry, registryAbi, "findTokenId", [
          parentLabel,
        ])) as bigint;
        await chain.send(
          "admin",
          ENS_SEPOLIA.ethRegistry,
          encodeFunctionData({
            abi: registryAbi,
            functionName: "setSubregistry",
            args: [tokenId, registry.address],
          }),
        );
      }
      return registry.address;
    },

    /**
     * Gives a trip its own registry and resolver under the parent name, registers a subname for
     * every member and the agent that expires when the trip ends, points each at its address, and
     * lets the agent write the trip's itinerary record and nothing else. Safe to run again, for
     * example after members join.
     */
    async provisionTrip(input: TripNamesInput): Promise<TripNames> {
      const expiry = BigInt(Math.floor(input.endsAt.getTime() / 1000));
      if (expiry <= BigInt(Math.floor(Date.now() / 1000)))
        throw new AppError("TRIP_ENDED", "Trip names cannot be created after the trip ends.", 409);

      const parent = await parentRegistry();
      const label = input.label ?? tripLabel(input.name, input.vault);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label) || label.length > 63)
        throw new AppError("INVALID_ENS_LABEL", "The trip name label is invalid.", 400);
      const trip = `${label}.${parentName}`;

      const resolver = await ensureProxy(
        ENS_SEPOLIA.permissionedResolverImpl,
        salt("resolver", input.vault.toLowerCase()),
        encodeFunctionData({
          abi: resolverAbi,
          functionName: "initialize",
          args: [[{ account: chain.admin, roleBitmap: ADMIN_RESOLVER_ROLES }], []],
        }),
      );
      const registry = await ensureProxy(
        ENS_SEPOLIA.userRegistryImpl,
        salt("registry", input.vault.toLowerCase()),
        encodeFunctionData({
          abi: registryAbi,
          functionName: "initialize",
          args: [[{ account: chain.admin, roleBitmap: ADMIN_REGISTRY_ROLES }]],
        }),
      );
      const [currentParent, currentLabel] = (await read(
        registry.address,
        registryAbi,
        "getParent",
        [],
      )) as [Address, string];
      if (getAddress(currentParent) !== parent || currentLabel !== label)
        await chain.send(
          "admin",
          registry.address,
          encodeFunctionData({
            abi: registryAbi,
            functionName: "setParent",
            args: [parent, label],
          }),
        );

      // The trip name itself stays with the admin; it points at the trip's registry and resolver.
      const currentOwner = await ownerOf(parent, label);
      if (currentOwner === zeroAddress)
        await chain.send(
          "admin",
          parent,
          encodeFunctionData({
            abi: registryAbi,
            functionName: "register",
            args: [label, chain.admin, registry.address, resolver.address, 0n, expiry],
          }),
        );
      else if (
        currentOwner !== chain.admin ||
        getAddress((await read(parent, registryAbi, "getSubregistry", [label])) as Address) !==
          registry.address
      )
        throw new AppError("ENS_LABEL_TAKEN", `The name ${label} belongs to another trip.`, 409);

      const labels = memberLabels(input.members);
      for (const member of input.members) {
        if (member.label !== undefined) labels.set(member.address.toLowerCase(), member.label);
      }
      if (
        [...labels.values()].some(
          (value) =>
            value === AGENT_LABEL || value.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
        ) ||
        new Set(labels.values()).size !== labels.size
      )
        throw new AppError(
          "INVALID_ENS_LABEL",
          "Member name labels must be valid and unique.",
          400,
        );
      const holders: Array<{ label: string; address: Address }> = [
        ...input.members.map((member) => ({
          label: labels.get(member.address.toLowerCase()) ?? AGENT_LABEL,
          address: getAddress(member.address),
        })),
        { label: AGENT_LABEL, address: chain.agent },
      ];
      // Repair records even when registration succeeded before an earlier RPC failure.
      const addressRecords: Hex[] = [
        encodeFunctionData({
          abi: resolverAbi,
          functionName: "setAddress",
          args: [dnsEncode(trip), ETH_COIN_TYPE, input.vault],
        }),
      ];
      for (const holder of holders) {
        await register(registry.address, holder.label, holder.address, resolver.address, expiry);
        addressRecords.push(
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "setAddress",
            args: [dnsEncode(`${holder.label}.${trip}`), ETH_COIN_TYPE, holder.address],
          }),
        );
      }
      if (addressRecords.length > 0)
        await chain.send(
          "admin",
          resolver.address,
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "multicall",
            args: [addressRecords],
          }),
        );

      const itineraryResource = BigInt(keccak256(toHex(ITINERARY_KEY)));
      if (
        !((await read(resolver.address, resolverAbi, "hasRoles", [
          itineraryResource,
          RESOLVER_ROLES.setText,
          chain.agent,
        ])) as boolean)
      )
        await chain.send(
          "admin",
          resolver.address,
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "grantSetterRoles",
            // Only the key in this setter matters: the role covers `itinerary` on this resolver.
            args: [
              encodeFunctionData({
                abi: resolverAbi,
                functionName: "setText",
                args: [dnsEncode(trip), ITINERARY_KEY, ""],
              }),
              chain.agent,
            ],
          }),
        );

      return {
        trip,
        agent: `${AGENT_LABEL}.${trip}`,
        members: Object.fromEntries(
          input.members.map((member) => [
            getAddress(member.address),
            `${labels.get(member.address.toLowerCase())}.${trip}`,
          ]),
        ),
        registry: registry.address,
        resolver: resolver.address,
      };
    },

    /** The trip name and resolver a trip gets, without sending anything. */
    async namesFor(
      vault: Address,
      tripName: string,
    ): Promise<Pick<TripNames, "trip" | "resolver">> {
      return {
        trip: `${tripLabel(tripName, vault)}.${parentName}`,
        resolver: await predict(salt("resolver", vault.toLowerCase())),
      };
    },

    /** The agent publishes the trip's itinerary summary on the trip name. */
    async writeItinerary(names: Pick<TripNames, "trip" | "resolver">, itinerary: string) {
      return chain.send(
        "agent",
        names.resolver,
        encodeFunctionData({
          abi: resolverAbi,
          functionName: "setText",
          args: [dnsEncode(names.trip), ITINERARY_KEY, itinerary],
        }),
      );
    },

    /** Simulates a text write by the agent without sending it, to prove what it may change. */
    async agentCanWrite(names: Pick<TripNames, "trip" | "resolver">, key: string) {
      try {
        await chain.call(
          names.resolver,
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "setText",
            args: [dnsEncode(names.trip), key, "check"],
          }),
          chain.agent,
        );
        return true;
      } catch (error) {
        if (error instanceof AppError && error.code === "ENS_CALL_REVERTED") return false;
        throw error;
      }
    },
  };
}

export type EnsService = ReturnType<typeof createEnsService>;
