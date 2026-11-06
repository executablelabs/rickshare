import { HourglassMedium, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { AuthGuard } from "../auth/AuthGuard";
import { toWalletCall, useWallet } from "../auth/wallet";
import { Loader } from "../components/brand/Loader";
import { TravelArt, TravelStamp } from "../components/brand/Travel";
import { Wordmark } from "../components/brand/Wordmark";
import { FundingAddress } from "../components/trips/FundingAddress";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Steps, useStepRunner } from "../components/ui/Steps";
import { messageOf } from "../lib/http";
import { inviteApi, tripKeys } from "../lib/trips";

export const Route = createFileRoute("/join/$token")({
  component: Join,
});

function Join() {
  return (
    <AuthGuard
      title="You're invited"
      description="Sign in to join your friends' trip. You'll only ever pay for what you approve."
    >
      <JoinCard />
    </AuthGuard>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <main className="travel-entry">
      <div className="travel-entry__story">
        <Wordmark />
        <p>
          Good company.
          <br />
          <span>Your next adventure.</span>
        </p>
        <TravelArt vehicle="plane" photo />
      </div>
      <div className="travel-entry__card">
        <TravelStamp vehicle="plane">A personal invitation</TravelStamp>
        <div className="flex flex-col gap-3">
          <span className="travel-entry__icon">{icon}</span>
          <h1 className="text-3xl">{title}</h1>
        </div>
        {children}
        <p className="travel-entry__footer">Your share. Your call. Every step of the way.</p>
      </div>
    </main>
  );
}

const JOIN_STEPS = ["Confirm in your wallet", "Join the trip"];

function JoinCard() {
  const { token } = Route.useParams();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const runner = useStepRunner();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Claiming is idempotent for the same account, so a reload simply returns the same invite.
  const claim = useQuery({
    queryKey: ["invite-claim", token],
    queryFn: () => inviteApi.claim(token),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const inviteId = claim.data?.inviteId;
  const state = useQuery({
    queryKey: ["invite", inviteId],
    enabled: !!inviteId,
    queryFn: () => inviteApi.state(inviteId ?? ""),
    // Waiting for the organizer to let this account in.
    refetchInterval: (query) => (query.state.data?.status === "claimed" ? 3000 : false),
  });
  const invite = state.data ?? claim.data;

  if (claim.isError)
    return (
      <Card icon={<WarningCircle aria-hidden="true" size={24} />} title="This invite can't be used">
        <p role="alert" className="text-ink-muted">
          {messageOf(claim.error)}
        </p>
        <Link
          to="/"
          className="inline-flex h-12 items-center justify-center rounded-control font-semibold text-ink ring-1 ring-inset ring-rule-strong"
        >
          Go to my trips
        </Link>
      </Card>
    );

  if (!invite) return <Loader label="Opening your invite" />;

  if (invite.status === "expired")
    return (
      <Card icon={<WarningCircle aria-hidden="true" size={24} />} title="This invite expired">
        <p className="text-ink-muted">Ask the organizer for a new link.</p>
      </Card>
    );

  if (invite.status === "claimed" || invite.status === "open")
    return (
      <Card
        icon={<HourglassMedium aria-hidden="true" size={24} />}
        title="Waiting for the organizer"
      >
        <p className="text-ink-muted">
          They'll get a request to let you in. This page moves on by itself as soon as they do.
        </p>
        <Loader label="Waiting to be let in" />
      </Card>
    );

  if (invite.status === "authorized" && invite.transaction) {
    const transaction = invite.transaction;
    const join = () =>
      void runner.run(async (next) => {
        const hash = await wallet.sendTransaction(toWalletCall(transaction));
        next();
        await inviteApi.confirm(invite.inviteId, hash);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["invite", invite.inviteId] }),
          queryClient.invalidateQueries({ queryKey: tripKeys.list }),
        ]);
      });
    return (
      <Card icon={<UsersThree aria-hidden="true" size={24} />} title="You're in. Join the trip">
        <p className="text-ink-muted">
          Joining adds you to the trip's shared fund. You still approve every share yourself.
        </p>
        <Steps labels={JOIN_STEPS} current={runner.current} error={runner.error} />
        <FundingAddress />
        <Button fullWidth disabled={runner.running} onClick={join}>
          {runner.running ? "Joining…" : runner.error ? "Try again" : "Join the trip"}
        </Button>
      </Card>
    );
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter the name your friends know you by.");
      return;
    }
    if (!invite) return;
    setSaving(true);
    try {
      await inviteApi.profile(invite.tripId, trimmed);
      await navigate({ to: "/trips/$tripId/plan", params: { tripId: invite.tripId } });
    } catch (error) {
      setNameError(messageOf(error));
      setSaving(false);
    }
  }

  return (
    <Card
      icon={<UsersThree aria-hidden="true" size={24} />}
      title="What should the group call you?"
    >
      <form noValidate onSubmit={(event) => void saveName(event)} className="flex flex-col gap-5">
        <Field
          label="Your name"
          placeholder="Bashy"
          maxLength={32}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          error={nameError}
          disabled={saving}
          autoComplete="given-name"
        />
        <Button type="submit" fullWidth disabled={saving}>
          {saving ? "Saving…" : "Open the trip"}
        </Button>
      </form>
    </Card>
  );
}
