import { cx } from "../../lib/cx";

type AvatarSize = "sm" | "md";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
};

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function initialOf(name: string): string {
  const [first = "?"] = Array.from(name.trim());
  return first.toLocaleUpperCase();
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-card font-semibold text-ink ring-1 ring-inset ring-ink",
        sizeClasses[size],
        className,
      )}
    >
      <span aria-hidden="true">{initialOf(name)}</span>
    </span>
  );
}
