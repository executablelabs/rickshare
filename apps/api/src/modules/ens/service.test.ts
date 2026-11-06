import { describe, expect, test } from "bun:test";
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  getAddress,
  type Hex,
  keccak256,
  toHex,
  zeroAddress,
} from "viem";
import { AppError } from "../../lib/errors";
import { ENS_SEPOLIA, factoryAbi, RESOLVER_ROLES, registryAbi, resolverAbi } from "./contracts";
import { dnsEncode } from "./names";
import { createEnsService, type EnsChain, ITINERARY_KEY } from "./service";

const ADMIN = getAddress("0x3ca4e79729cdc7950af8602ad8b9379414667bd6");
const AGENT = getAddress("0x00000000000000000000000000000000000000a9");
const ANGIE = getAddress("0x0000000000000000000000000000000000000a01");
const BASHY = getAddress("0x0000000000000000000000000000000000000b02");
const GITAU = getAddress("0x0000000000000000000000000000000000000c03");
const VAULT = getAddress("0x3fa2000000000000000000000000000000000001");
const ETH_REGISTRY = getAddress(ENS_SEPOLIA.ethRegistry);
const FACTORY = getAddress(ENS_SEPOLIA.verifiableFactory);
const ITINERARY_RESOURCE = BigInt(keccak256(toHex(ITINERARY_KEY)));

type Entry = { owner: Address; subregistry: Address; resolver: Address; expiry: bigint };
type Sent = {
  signer: "admin" | "agent";
  to: Address;
  functionName: string;
  args: readonly unknown[];
};

/** A small in-memory ENSv2: registries, resolvers and the factory, with their permission rules. */
class FakeEns implements EnsChain {
  admin = ADMIN;
  agent = AGENT;
  sent: Sent[] = [];
  code = new Set<Address>([ETH_REGISTRY, FACTORY]);
  registries = new Map<Address, Map<string, Entry>>([
    [ETH_REGISTRY, new Map([["rickshare", entry(ADMIN)]])],
  ]);
  parents = new Map<Address, [Address, string]>();
  addresses = new Map<string, Address>();
  texts = new Map<string, string>();
  itineraryWriters = new Set<Address>();
  failNext: string | undefined;

  predict(salt: bigint) {
    return getAddress(
      `0x${keccak256(encodeAbiParameters([{ type: "uint256" }], [salt])).slice(26)}`,
    );
  }

  async hasCode(address: Address) {
    return this.code.has(getAddress(address));
  }

  async call(to: Address, data: Hex, from?: Address): Promise<Hex> {
    to = getAddress(to);
    if (to === FACTORY) {
      const { args } = decodeFunctionData({ abi: factoryAbi, data });
      return encodeFunctionResult({
        abi: factoryAbi,
        functionName: "predictProxyAddress",
        result: this.predict(args[1] as bigint),
      });
    }
    if (this.registries.has(to)) {
      const call = decodeFunctionData({ abi: registryAbi, data });
      const found = this.registries.get(to)?.get(call.args?.[0] as string);
      switch (call.functionName) {
        case "getParent":
          return encodeFunctionResult({
            abi: registryAbi,
            functionName: "getParent",
            result: this.parents.get(to) ?? [zeroAddress, ""],
          });
        case "findOwner":
          return encodeFunctionResult({
            abi: registryAbi,
            functionName: "findOwner",
            result: found?.owner ?? zeroAddress,
          });
        case "getSubregistry":
          return encodeFunctionResult({
            abi: registryAbi,
            functionName: "getSubregistry",
            result: found?.subregistry ?? zeroAddress,
          });
        case "findTokenId":
          return encodeFunctionResult({
            abi: registryAbi,
            functionName: "findTokenId",
            result: 123n,
          });
        default:
          throw new Error(`unexpected registry read ${call.functionName}`);
      }
    }
    const call = decodeFunctionData({ abi: resolverAbi, data });
    if (call.functionName === "hasRoles") {
      const [resource, roles, account] = call.args as [bigint, bigint, Address];
      return encodeFunctionResult({
        abi: resolverAbi,
        functionName: "hasRoles",
        result:
          resource === ITINERARY_RESOURCE &&
          roles === RESOLVER_ROLES.setText &&
          this.itineraryWriters.has(account),
      });
    }
    // Any other call is a simulated write.
    this.apply(from === AGENT ? "agent" : "admin", to, data);
    return "0x";
  }

  async send(signer: "admin" | "agent", to: Address, data: Hex) {
    this.apply(signer, getAddress(to), data);
    return keccak256(data);
  }

  private apply(signer: "admin" | "agent", to: Address, data: Hex, record = true) {
    const abi = to === FACTORY ? factoryAbi : this.registries.has(to) ? registryAbi : resolverAbi;
    const call = decodeFunctionData({ abi, data } as never) as {
      functionName: string;
      args: readonly unknown[];
    };
    if (record) this.sent.push({ signer, to, functionName: call.functionName, args: call.args });
    if (this.failNext === call.functionName) {
      this.failNext = undefined;
      throw new Error("simulated RPC failure");
    }
    const [a, b, c, d, , f] = call.args;
    const revert = () => {
      throw new AppError("ENS_CALL_REVERTED", "rejected", 409);
    };
    switch (call.functionName) {
      case "deployProxy": {
        const address = this.predict(b as bigint);
        this.code.add(address);
        if (getAddress(a as Address) === getAddress(ENS_SEPOLIA.userRegistryImpl))
          this.registries.set(address, new Map());
        return;
      }
      case "setParent":
        this.parents.set(to, [getAddress(a as Address), b as string]);
        return;
      case "setSubregistry": {
        const parent = this.registries.get(to)?.get("rickshare");
        if (parent) parent.subregistry = getAddress(b as Address);
        return;
      }
      case "register": {
        const labels = this.registries.get(to);
        if (!labels || signer !== "admin" || labels.get(a as string)) return revert();
        labels.set(a as string, {
          owner: getAddress(b as Address),
          subregistry: getAddress(c as Address),
          resolver: getAddress(d as Address),
          expiry: f as bigint,
        });
        return;
      }
      case "multicall":
        for (const inner of a as Hex[]) this.apply(signer, to, inner, false);
        return;
      case "setAddress":
        if (signer !== "admin") return revert();
        this.addresses.set(a as string, getAddress(c as Address));
        return;
      case "setText":
        if (signer !== "admin" && !(b === ITINERARY_KEY && this.itineraryWriters.has(AGENT)))
          return revert();
        this.texts.set(`${a}:${b}`, c as string);
        return;
      case "grantSetterRoles":
        if (signer !== "admin") return revert();
        this.itineraryWriters.add(getAddress(b as Address));
        return;
      default:
        throw new Error(`unexpected write ${call.functionName}`);
    }
  }

  sentNames() {
    return this.sent.map((sent) => sent.functionName);
  }
}

function entry(owner: Address): Entry {
  return { owner, subregistry: zeroAddress, resolver: zeroAddress, expiry: 2n ** 40n };
}

const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const trip = {
  vault: VAULT,
  name: "India 26",
  endsAt,
  members: [
    { address: ANGIE, displayName: "Angie" },
    { address: BASHY, displayName: "Bashy" },
  ],
};

async function setUp() {
  const chain = new FakeEns();
  const ens = createEnsService({ chain, parentName: "rickshare.eth" });
  await ens.ensureParent();
  chain.sent = [];
  return { chain, ens };
}

describe("parent setup", () => {
  test("deploys an admin-controlled registry and attaches it to the parent name once", async () => {
    const chain = new FakeEns();
    const ens = createEnsService({ chain, parentName: "rickshare.eth" });

    const registry = await ens.ensureParent();
    expect(chain.sentNames()).toEqual(["deployProxy", "setParent", "setSubregistry"]);
    expect(chain.parents.get(registry)).toEqual([ETH_REGISTRY, "rickshare"]);
    expect(chain.registries.get(ETH_REGISTRY)?.get("rickshare")?.subregistry).toBe(registry);

    chain.sent = [];
    expect(await ens.ensureParent()).toBe(registry);
    expect(chain.sent).toEqual([]);
  });

  test("rejects a parent that is not a second-level .eth name", () => {
    expect(() =>
      createEnsService({ chain: new FakeEns(), parentName: "trips.rickshare.eth" }),
    ).toThrow(AppError);
  });

  test("trip names wait for the parent setup", async () => {
    const ens = createEnsService({ chain: new FakeEns(), parentName: "rickshare.eth" });
    await expect(ens.provisionTrip(trip)).rejects.toMatchObject({ code: "ENS_NOT_SET_UP" });
  });
});

describe("trip names", () => {
  test("repairs records after registration succeeded but the address write failed", async () => {
    const { chain, ens } = await setUp();
    chain.failNext = "multicall";
    await expect(ens.provisionTrip(trip)).rejects.toThrow("simulated RPC failure");
    chain.sent = [];
    const names = await ens.provisionTrip(trip);
    expect(chain.sentNames()).not.toContain("register");
    expect(chain.addresses.get(dnsEncode(names.trip))).toBe(VAULT);
    expect(chain.addresses.get(dnsEncode(names.members[ANGIE] ?? ""))).toBe(ANGIE);
    expect(await ens.agentCanWrite(names, ITINERARY_KEY)).toBe(true);
  });

  test("repairs parent links after deployment succeeded but linking failed", async () => {
    const { chain, ens } = await setUp();
    chain.failNext = "setParent";
    await expect(ens.provisionTrip(trip)).rejects.toThrow("simulated RPC failure");
    const names = await ens.provisionTrip(trip);
    expect(chain.parents.get(names.registry)?.[1]).toBe("india-26-3fa2");
  });

  test("uses persisted labels after trip/member display names change", async () => {
    const { ens } = await setUp();
    const names = await ens.provisionTrip(trip);
    const renamed = await ens.provisionTrip({
      ...trip,
      name: "New name",
      label: "india-26-3fa2",
      members: trip.members.map((member) => ({
        ...member,
        displayName: "Changed",
        label: member.address === ANGIE ? "angie" : "bashy",
      })),
    });
    expect(renamed).toEqual(names);
  });

  test("rejects a trip label already attached to another vault", async () => {
    const { ens } = await setUp();
    await ens.provisionTrip(trip);
    await expect(
      ens.provisionTrip({
        ...trip,
        vault: getAddress("0x3fa2000000000000000000000000000000000002"),
      }),
    ).rejects.toMatchObject({ code: "ENS_LABEL_TAKEN" });
  });
  test("register the trip, each member and the agent until the trip ends", async () => {
    const { chain, ens } = await setUp();

    const names = await ens.provisionTrip(trip);

    expect(names).toMatchObject({
      trip: "india-26-3fa2.rickshare.eth",
      agent: "agent.india-26-3fa2.rickshare.eth",
      members: {
        [ANGIE]: "angie.india-26-3fa2.rickshare.eth",
        [BASHY]: "bashy.india-26-3fa2.rickshare.eth",
      },
    });
    const expiry = BigInt(Math.floor(endsAt.getTime() / 1000));
    const tripRegistry = chain.registries.get(names.registry);
    expect(
      [...(tripRegistry?.entries() ?? [])].map(([label, e]) => [
        label,
        e.owner,
        e.expiry,
        e.resolver,
      ]),
    ).toEqual([
      ["angie", ANGIE, expiry, names.resolver],
      ["bashy", BASHY, expiry, names.resolver],
      ["agent", AGENT, expiry, names.resolver],
    ]);
    const parentEntry = [...chain.registries.values()]
      .find((labels) => labels.has("india-26-3fa2"))
      ?.get("india-26-3fa2");
    expect(parentEntry).toMatchObject({
      owner: ADMIN,
      subregistry: names.registry,
      resolver: names.resolver,
      expiry,
    });
  });

  test("never hands member names any roles, so members cannot repoint or move them", async () => {
    const { chain, ens } = await setUp();
    await ens.provisionTrip(trip);
    const registrations = chain.sent.filter((sent) => sent.functionName === "register");
    expect(registrations.every((sent) => sent.args[4] === 0n)).toBe(true);
  });

  test("point every name at its address and the trip name at the vault", async () => {
    const { chain, ens } = await setUp();
    const names = await ens.provisionTrip(trip);
    expect(chain.addresses.get(dnsEncode(names.trip))).toBe(VAULT);
    expect(chain.addresses.get(dnsEncode(names.members[ANGIE] ?? ""))).toBe(ANGIE);
    expect(chain.addresses.get(dnsEncode(names.agent))).toBe(AGENT);
  });

  test("let the agent write the itinerary record and nothing else", async () => {
    const { chain, ens } = await setUp();
    const names = await ens.provisionTrip(trip);

    expect(await ens.agentCanWrite(names, ITINERARY_KEY)).toBe(true);
    for (const key of ["description", "url", "avatar", "itinerary.v2"])
      expect(await ens.agentCanWrite(names, key)).toBe(false);

    await ens.writeItinerary(names, "Sat: paragliding, Arambol");
    expect(chain.sent.at(-1)).toMatchObject({ signer: "agent", functionName: "setText" });
    expect(chain.texts.get(`${dnsEncode(names.trip)}:${ITINERARY_KEY}`)).toBe(
      "Sat: paragliding, Arambol",
    );
  });

  test("on a rerun only register members who joined since", async () => {
    const { chain, ens } = await setUp();
    await ens.provisionTrip(trip);
    chain.sent = [];

    const names = await ens.provisionTrip({
      ...trip,
      members: [...trip.members, { address: GITAU, displayName: "Gitau" }],
    });

    expect(chain.sentNames()).toEqual(["register", "multicall"]);
    expect(names.members[GITAU]).toBe("gitau.india-26-3fa2.rickshare.eth");
  });

  test("refuse a member label someone else already holds", async () => {
    const { chain, ens } = await setUp();
    const names = await ens.provisionTrip(trip);
    chain.registries.get(names.registry)?.set("gitau", entry(ANGIE));

    await expect(
      ens.provisionTrip({
        ...trip,
        members: [...trip.members, { address: GITAU, displayName: "Gitau" }],
      }),
    ).rejects.toMatchObject({ code: "ENS_LABEL_TAKEN" });
  });

  test("refuse to create names for a trip that has ended", async () => {
    const { ens } = await setUp();
    await expect(
      ens.provisionTrip({ ...trip, endsAt: new Date(Date.now() - 1000) }),
    ).rejects.toMatchObject({
      code: "TRIP_ENDED",
    });
  });
});
