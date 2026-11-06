import {
  CalendarBlank,
  CaretLeft,
  ChatsCircle,
  Coins,
  type Icon,
  SignOut,
  SquaresFour,
} from "@phosphor-icons/react";
import type { Member } from "@rickshare/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { Wordmark } from "../brand/Wordmark";
import { AvatarStack } from "../ui/AvatarStack";

type TripTabPath = "/trips/$tripId/plan" | "/trips/$tripId/itinerary" | "/trips/$tripId/money";

const tabs: Array<{ to: TripTabPath; label: string; icon: Icon }> = [
  { to: "/trips/$tripId/plan", label: "Plan", icon: ChatsCircle },
  { to: "/trips/$tripId/itinerary", label: "Itinerary", icon: CalendarBlank },
  { to: "/trips/$tripId/money", label: "Money", icon: Coins },
];

export interface AppShellProps {
  tripId: string;
  tripName?: string | undefined;
  /** A short line under the trip name, e.g. "Ends 18 Dec". */
  subtitle?: string | undefined;
  members?: Array<Pick<Member, "address" | "displayName">> | undefined;
  /** Right panel for the group's money, from 1280px where there is room for it. */
  aside?: ReactNode;
  onSignOut?: (() => void) | undefined;
  children: ReactNode;
}

const railLink =
  "flex min-h-12 items-center gap-3 rounded-control px-4 text-card/70 hover:bg-card/10 hover:text-card motion-safe:transition-colors motion-safe:duration-150";

export function AppShell({
  tripId,
  tripName,
  subtitle,
  members,
  aside,
  onSignOut,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[256px_minmax(0,560px)_minmax(320px,1fr)]">
      {/* On phones only the tab bar shows; from 1024px this column is the navy rail. */}
      <div className="contents lg:sticky lg:top-0 lg:col-start-1 lg:row-start-1 lg:flex lg:h-dvh lg:flex-col lg:bg-ink lg:px-4 lg:py-8">
        <div className="hidden px-3 pb-8 lg:block">
          <Wordmark tone="card" />
        </div>
        <nav
          aria-label="Trip"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] lg:static lg:border-t-0 lg:bg-transparent lg:pb-0 lg:text-card"
        >
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
        <div className="mt-auto hidden flex-col gap-1 border-t border-card/10 pt-4 lg:flex">
          <Link to="/" className={railLink}>
            <SquaresFour aria-hidden="true" size={20} />
            All trips
          </Link>
          {onSignOut && (
            <button type="button" onClick={onSignOut} className={railLink}>
              <SignOut aria-hidden="true" size={20} />
              Sign out
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col pb-28 lg:col-start-2 lg:row-start-1 lg:pr-10 lg:pb-10 xl:pr-0">
        <header
          className={cx(
            "flex min-h-20 items-center justify-between gap-3 rounded-b-band bg-ink px-5 pt-[max(20px,env(safe-area-inset-top))] pb-5 text-card",
            "lg:mt-8 lg:rounded-band lg:px-6 lg:pt-5",
            // The desktop rail already carries the brand, so a header without a trip stays mobile-only.
            !tripName && "lg:hidden",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/"
              aria-label="All trips"
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-pill text-card hover:bg-card/10 lg:hidden"
            >
              <CaretLeft aria-hidden="true" size={20} />
            </Link>
            {tripName ? (
              <div className="flex min-w-0 flex-col">
                <p className="truncate font-display text-2xl font-semibold">{tripName}</p>
                {subtitle && <p className="text-sm text-card/75">{subtitle}</p>}
              </div>
            ) : (
              <Wordmark tone="card" />
            )}
          </div>
          {members && members.length > 0 && <AvatarStack members={members} onInk />}
        </header>
        <main className="px-5 py-6 lg:px-0 lg:py-8">{children}</main>
      </div>

      {aside && (
        <aside
          aria-label="Group money"
          className="hidden xl:col-start-3 xl:row-start-1 xl:block xl:py-8 xl:pr-10"
        >
          {/* Stays in view while a long feed scrolls past. */}
          <div className="xl:sticky xl:top-8">{aside}</div>
        </aside>
      )}
    </div>
  );
}
