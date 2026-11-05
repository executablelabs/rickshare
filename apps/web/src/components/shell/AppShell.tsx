import { CalendarBlank, ChatsCircle, Coins, type Icon } from "@phosphor-icons/react";
import type { Member } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  members?: Array<Pick<Member, "address" | "displayName">>;
  /** Desktop-only right panel for the group's money. */
  aside?: ReactNode;
  children: ReactNode;
}

export function AppShell({ tripId, tripName, members, aside, children }: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,560px)_minmax(0,1fr)] lg:gap-x-10">
      <nav
        aria-label="Trip"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:col-start-1 lg:row-start-1 lg:h-dvh lg:border-t-0 lg:border-r lg:bg-paper lg:px-4 lg:py-8"
      >
        <p className="hidden px-3 pb-6 font-display text-lg font-semibold lg:block">Rickshare</p>
        <ul className="flex lg:flex-col lg:gap-1">
          {tabs.map(({ to, label, icon: TabIcon }) => (
            <li key={to} className="flex-1 lg:flex-none">
              <Link
                to={to}
                params={{ tripId }}
                className="group relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-ink-muted aria-[current=page]:font-semibold aria-[current=page]:text-ink lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:px-3 lg:text-base"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 top-0 h-0.5 rounded-pill group-aria-[current=page]:bg-ink lg:inset-x-auto lg:top-3 lg:bottom-3 lg:left-0 lg:h-auto lg:w-0.5"
                />
                <TabIcon aria-hidden="true" size={20} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col pb-24 lg:col-start-2 lg:row-start-1 lg:pb-10">
        {tripName && (
          <header className="flex items-center justify-between gap-4 px-5 pt-5 lg:px-0 lg:pt-8">
            <p className="font-display text-xl font-semibold">{tripName}</p>
            {members && members.length > 0 && <AvatarStack members={members} />}
          </header>
        )}
        <main className="px-5 py-5 lg:px-0 lg:py-8">{children}</main>
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
