import type { Member } from "@rickshare/shared";
import { Avatar } from "./Avatar";

export interface AvatarStackProps {
  members: Array<Pick<Member, "address" | "displayName">>;
  max?: number;
  /** On the navy header the gap between overlapping avatars is navy, not paper. */
  onInk?: boolean;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function AvatarStack({ members, max = 3, onInk = false }: AvatarStackProps) {
  const visible = members.slice(0, Math.max(1, max));
  const hiddenCount = members.length - visible.length;
  const outline = onInk ? "outline-2 outline-ink" : "outline-2 outline-paper";

  return (
    <span
      role="img"
      aria-label={listNames(members.map((member) => member.displayName))}
      className="inline-flex items-center"
    >
      {visible.map((member, index) => (
        <Avatar
          key={member.address}
          name={member.displayName}
          colorKey={member.address}
          size="sm"
          className={index === 0 ? outline : `-ml-2 ${outline}`}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          aria-hidden="true"
          className={`-ml-2 inline-flex size-8 items-center justify-center rounded-pill bg-card text-xs text-ink-muted ring-1 ring-inset ring-rule ${outline}`}
        >
          +{hiddenCount}
        </span>
      )}
    </span>
  );
}
