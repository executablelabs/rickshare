import { LinkSimple, Plus, SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { useSession } from "../../auth/session";
import { useWallet } from "../../auth/wallet";
import { messageOf } from "../../lib/http";
import { useTrips } from "../../lib/trips";
import { Loader } from "../brand/Loader";
import { RickshawMark } from "../brand/RickshawMark";
import { Wordmark } from "../brand/Wordmark";
import { Button } from "../ui/Button";
import { CreateTripSheet } from "./CreateTripSheet";
import { TripCard } from "./TripCard";

export function Home() {
  const wallet = useWallet();
  const auth = useSession();
  const trips = useTrips();
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <Wordmark />
          <Button
            variant="secondary"
            className="h-11 px-4"
            disabled={auth.pending}
            onClick={() => void auth.signOut()}
          >
            <SignOut aria-hidden="true" size={20} />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1>Your trips</h1>
            <p className="text-ink-muted">Plan together and approve your own share.</p>
          </div>
          {trips.data && trips.data.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" size={20} />
              New trip
            </Button>
          )}
        </div>

        {trips.isPending && <Loader label="Loading your trips" />}
        {trips.isError && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-ticket bg-card p-5 shadow-card"
          >
            <p>{messageOf(trips.error)}</p>
            <Button variant="secondary" onClick={() => void trips.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {trips.data && trips.data.length === 0 && (
          <section className="flex flex-col items-center gap-4 rounded-ticket bg-card px-6 py-12 text-center shadow-card lg:py-16">
            <span className="flex size-20 items-center justify-center rounded-pill bg-coral-tint">
              <RickshawMark className="w-12 text-ink" />
            </span>
            <h2 className="text-2xl">No trips yet</h2>
            <p className="max-w-[420px] text-ink-muted">
              Start a trip, invite your friends and let the planner find things to do.
            </p>
            <Button onClick={() => setCreating(true)} className="px-6">
              <Plus aria-hidden="true" size={20} />
              Start a trip
            </Button>
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <LinkSimple aria-hidden="true" size={16} />
              Got an invite link? Open it to join your friends' trip.
            </p>
          </section>
        )}
        {trips.data && trips.data.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            {trips.data.map((trip) => (
              <li key={trip.id}>
                <TripCard trip={trip} viewer={wallet.address} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <CreateTripSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}
