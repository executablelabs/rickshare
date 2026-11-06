import { parseAbi } from "viem";

/**
 * ENSv2 on Sepolia, the deployment the ENS app and Universal Resolver use there.
 * Source: https://docs.ens.domains/learn/deployments (Sepolia, ENSv2).
 */
export const ENS_SEPOLIA = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
} as const;

/** Role bits from ENSv2 RegistryRolesLib; each `_ADMIN` bit is its role shifted left by 128. */
const admin = (role: bigint) => role << 128n;
export const REGISTRY_ROLES = {
  registrar: 1n << 0n,
  setParent: 1n << 8n,
  unregister: 1n << 12n,
  renew: 1n << 16n,
  setSubregistry: 1n << 20n,
  setResolver: 1n << 24n,
} as const;

/** Role bits from ENSv2 PermissionedResolverLib. */
export const RESOLVER_ROLES = {
  setAddress: 1n << 0n,
  setText: 1n << 4n,
  setContenthash: 1n << 8n,
  setName: 1n << 20n,
  setData: 1n << 24n,
} as const;

const withAdmin = (roles: Record<string, bigint>) =>
  Object.values(roles).reduce((bitmap, role) => bitmap | role | admin(role), 0n);

/**
 * What the ENS admin holds on every registry and resolver it deploys. Upgrade rights are left out
 * on purpose: nobody can swap the code behind a trip's names.
 */
export const ADMIN_REGISTRY_ROLES = withAdmin(REGISTRY_ROLES);
export const ADMIN_RESOLVER_ROLES = withAdmin(RESOLVER_ROLES);

/** ENSIP-11 coin type for Ethereum addresses. */
export const ETH_COIN_TYPE = 60n;

export const registryAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants)",
  "function findOwner(string label) view returns (address)",
  "function findTokenId(string label) view returns (uint256)",
  "function getSubregistry(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function setParent(address parent, string label)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
]);

export const resolverAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants, bytes[] calls)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function setText(bytes name, string key, string value)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function multicall(bytes[] calls)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);
