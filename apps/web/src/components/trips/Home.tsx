import { Compass, LinkSimple, Plus, SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { useSession } from "../../auth/session";
import { useWallet } from "../../auth/wallet";
import { useTrips } from "../../lib/trips";
import { BrandNav } from "../brand/BrandNav";
import { Loader } from "../brand/Loader";
import { TravelArt, TravelError, TravelStamp } from "../brand/Travel";
import { TapeLabel } from "../brand/TravelDetails";
import { Button } from "../ui/Button";
import { CreateTripSheet } from "./CreateTripSheet";
import { TripCard } from "./TripCard";

export function Home() {
  const wallet = useWallet();
  const auth = useSession();
  const trips = useTrips();
  const [creating, setCreating] = useState(false);

  return (
    <div className="travel-home min-h-dvh bg-paper">
      <header>
        <BrandNav vehicle="rickshaw">
          <Button
            variant="secondary"
            className="h-11 px-4"
            disabled={auth.pending}
            onClick={() => void auth.signOut()}
          >
            <SignOut aria-hidden="true" size={20} />
            Sign out
          </Button>
        </BrandNav>
      </header>

      <main className="travel-home__main">
        <section className="travel-home__hero" aria-labelledby="trips-title">
          <div>
            <p className="travel-kicker">
              <Compass size={20} aria-hidden="true" /> A little further, together.
            </p>
            <h1 id="trips-title">Your trips</h1>
            <p>Plan the days. Share the adventure. Keep your own say.</p>
            {trips.data && (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" size={20} />
                {trips.data.length ? "New trip" : "Start a trip"}
              </Button>
            )}
          </div>
          <TravelArt vehicle="plane" photo />
        </section>
        <div className="travel-home__collection">
          <div className="travel-section-heading">
            <h2>Your travel collection</h2>
            <span className="travel-kicker">Good days in the making</span>
          </div>

          {trips.isPending && <Loader label="Loading your trips" />}
          {trips.isError && (
            <TravelError error={trips.error} onRetry={() => void trips.refetch()} />
          )}
          {trips.data && trips.data.length === 0 && (
            <section className="travel-empty">
              <TravelStamp vehicle="rickshaw">Room for an adventure</TravelStamp>
              <h2 className="text-2xl">No trips yet</h2>
              <p className="max-w-[420px] text-ink-muted">
                Start a trip, invite your friends and let the planner find things to do.
              </p>
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <LinkSimple aria-hidden="true" size={16} />
                Got an invite link? Open it to join your friends' trip.
              </p>
            </section>
          )}
          {trips.data && trips.data.length > 0 && (
            <ul className="travel-grid">
              {trips.data.map((trip) => (
                <li key={trip.id}>
                  <TripCard trip={trip} viewer={wallet.address} />
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="travel-new-postcard"
                  onClick={() => setCreating(true)}
                >
                  <TapeLabel>Good days start here</TapeLabel>
                  <Plus size={32} aria-hidden="true" />
                  <span>Start a new adventure</span>
                </button>
              </li>
            </ul>
          )}
        </div>
      </main>

      <CreateTripSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}
