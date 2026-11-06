import { User } from "@phosphor-icons/react";
import { cx } from "../../lib/cx";

type AvatarSize = "sm" | "md";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
};

const memberTints = [
  "bg-coral-tint text-coral-ink",
  "bg-stamp-tint text-stamp-ink",
  "bg-marigold-tint text-marigold-ink",
  "bg-teal-tint text-teal-ink",
  "bg-violet-tint text-violet-ink",
] as const;

export interface AvatarProps {
  name: string;
  /** Picks the member's tint; pass the address so a member keeps one color everywhere. */
  colorKey?: string | undefined;
  size?: AvatarSize;
  className?: string;
}

export function displayNameOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed && !/^0x[\da-f]/i.test(trimmed) && !/\.eth$/i.test(trimmed)) return name;
  const travelers = [
    "Sunny traveler",
    "Coastal traveler",
    "Mountain traveler",
    "City explorer",
    "Island explorer",
    "Trail traveler",
  ];
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return travelers[hash % travelers.length] ?? "Travel buddy";
}

export function initialOf(name: string): string {
  if (displayNameOf(name) !== name) return "?";
  const [first = "?"] = Array.from(name.trim());
  return first.toLocaleUpperCase();
}

/** A stable tint per member. Case is ignored so checksummed and lowercase addresses agree. */
export function memberTint(colorKey: string): (typeof memberTints)[number] {
  let hash = 0;
  for (const char of colorKey.toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return memberTints[hash % memberTints.length] ?? memberTints[0];
}

export function Avatar({ name, colorKey = name, size = "md", className }: AvatarProps) {
  const label = displayNameOf(name);
  const hasName = label === name && name.trim().length > 0;
  return (
    <span
      role="img"
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-semibold",
        memberTint(colorKey),
        sizeClasses[size],
        className,
      )}
    >
      {hasName ? (
        <span aria-hidden="true">{initialOf(name)}</span>
      ) : (
        <User aria-hidden="true" size={20} />
      )}
    </span>
  );
}
