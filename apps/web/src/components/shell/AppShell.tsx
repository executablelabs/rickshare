import { CalendarBlank, ChatsCircle, Coins, type Icon } from "@phosphor-icons/react";
import type { Member } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { RickshawMark } from "../brand/RickshawMark";
import { AvatarStack } from "../ui/AvatarStack";

type TripTabPath = "/trips/$tripId/plan" | "/trips/$tripId/itinerary" | "/trips/$tripId/money";

const tabs: Array<{ to: TripTabPath; label: string; icon: Icon }> = [
  { to: "/trips/$tripId/plan", label: "Plan", icon: ChatsCircle },
  { to: "/trips/$tripId/itinerary", label: "Itinerary", icon: CalendarBlank },
  { to: "/trips/$tripId/money", label: "Money", icon: Coins },
];

export interface AppShellProps {
  tripId: string;
  tripName?: string;
  tripEnsName?: string | null;
  members?: Array<Pick<Member, "address" | "displayName">>;
  /** Desktop-only right panel for the group's money. */
  aside?: ReactNode;
  children: ReactNode;
}

function Brand({ className }: { className?: string }) {
  return (
    <p className={cx("items-center gap-2.5 font-display text-xl font-semibold", className)}>
      <RickshawMark className="w-10 text-card" />
      <span>
        Rick<span className="text-marigold">share</span>
      </span>
    </p>
  );
}

export function AppShell({
  tripId,
  tripName,
  tripEnsName,
  members,
  aside,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,560px)_minmax(0,1fr)] lg:gap-x-10">
      <nav
        aria-label="Trip"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:col-start-1 lg:row-start-1 lg:h-dvh lg:border-t-0 lg:bg-ink lg:px-4 lg:py-8 lg:text-card"
      >
        <Brand className="hidden px-3 pb-8 lg:flex" />
        <ul className="flex gap-1.5 px-3 py-2 lg:flex-col lg:gap-1 lg:p-0">
          {tabs.map(({ to, label, icon: TabIcon }) => (
            <li key={to} className="flex-1 lg:flex-none">
              <Link
                to={to}
                params={{ tripId }}
                className={cx(
                  "group relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-control text-xs text-ink-muted",
                  "motion-safe:transition-colors motion-safe:duration-150 hover:text-ink",
                  "aria-[current=page]:bg-ink aria-[current=page]:font-semibold aria-[current=page]:text-card",
                  "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base lg:text-card/70",
                  "lg:hover:bg-card/10 lg:hover:text-card lg:aria-[current=page]:bg-card/10",
                )}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-3 bottom-3 left-0 hidden w-1 rounded-pill group-aria-[current=page]:bg-coral lg:block"
                />
                <TabIcon aria-hidden="true" size={20} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col pb-28 lg:col-start-2 lg:row-start-1 lg:pb-10">
        <header
          className={cx(
            "flex min-h-20 items-center justify-between gap-4 rounded-b-band bg-ink px-5 pt-[max(20px,env(safe-area-inset-top))] pb-5 text-card",
            "lg:mt-8 lg:rounded-band lg:px-6 lg:pt-5",
            // The desktop rail already carries the brand, so a header without a trip stays mobile-only.
            !tripName && "lg:hidden",
          )}
        >
          {tripName ? (
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold">{tripName}</p>
              {tripEnsName && <p className="mt-1 break-all text-xs text-card/70">{tripEnsName}</p>}
            </div>
          ) : (
            <Brand className="flex" />
          )}
          {members && members.length > 0 && <AvatarStack members={members} onInk />}
        </header>
        <main className="px-5 py-6 lg:px-0 lg:py-8">{children}</main>
      </div>

      {aside && (
        <aside
          aria-label="Group money"
          className="hidden lg:col-start-3 lg:row-start-1 lg:block lg:py-8 lg:pr-10"
        >
          {aside}
        </aside>
      )}
    </div>
  );
}
