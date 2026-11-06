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
  colorKey?: string;
  size?: AvatarSize;
  className?: string;
}

export function initialOf(name: string): string {
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
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-semibold",
        memberTint(colorKey),
        sizeClasses[size],
        className,
      )}
    >
      <span aria-hidden="true">{initialOf(name)}</span>
    </span>
  );
}
