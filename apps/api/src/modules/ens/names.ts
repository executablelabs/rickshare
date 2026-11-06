import { type Hex, toHex } from "viem";

const MAX_LABEL_LENGTH = 32;
/** The agent's subname in every trip; members never get it. */
export const AGENT_LABEL = "agent";

/**
 * A readable ENS label: lowercase ASCII letters, digits and single hyphens. Accents are folded
 * ("Émile" becomes "emile"), so labels stay valid under ENS normalization without an extra library.
 */
export function toLabel(text: string, fallback: string): string {
  const label = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/, "");
  return label || fallback;
}

/** A trip label that stays unique across trips with the same name, e.g. "india-26-3fa2". */
export function tripLabel(tripName: string, vault: string): string {
  const suffix = vault.toLowerCase().replace(/^0x/, "").slice(0, 4);
  return `${toLabel(tripName, "trip").slice(0, MAX_LABEL_LENGTH - 5)}-${suffix}`;
}

/** Member labels unique within a trip; "agent" is reserved and repeats get a number. */
export function memberLabels(members: Array<{ address: string; displayName: string }>) {
  const taken = new Set([AGENT_LABEL]);
  const labels = new Map<string, string>();
  for (const member of members) {
    const base = toLabel(member.displayName, `member-${member.address.slice(2, 6).toLowerCase()}`);
    let label = base;
    for (let n = 2; taken.has(label); n++) label = `${base}-${n}`;
    taken.add(label);
    labels.set(member.address.toLowerCase(), label);
  }
  return labels;
}

/** DNS wire format, which ENSv2 resolver setters take as the `name` argument. */
export function dnsEncode(name: string): Hex {
  const bytes: number[] = [];
  for (const label of name.split(".")) {
    const encoded = new TextEncoder().encode(label);
    if (encoded.length === 0 || encoded.length > 255)
      throw new Error(`Invalid ENS label in ${name}`);
    bytes.push(encoded.length, ...encoded);
  }
  bytes.push(0);
  return toHex(new Uint8Array(bytes));
}
