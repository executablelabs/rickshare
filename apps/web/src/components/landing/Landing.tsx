import {
  ArrowUUpLeft,
  type Icon,
  SealCheck,
  ShieldCheck,
  Sparkle,
  Ticket,
  UsersThree,
} from "@phosphor-icons/react";
import type { Proposal } from "@rickshare/shared";
import { useWallet } from "../../auth/wallet";
import { SignInButton } from "../auth/SignInButton";
import { Wordmark } from "../brand/Wordmark";
import { ProposalTicket } from "../plan/ProposalTicket";
import { AvatarStack } from "../ui/AvatarStack";
import { Chip } from "../ui/Chip";

const promises: Array<{ icon: Icon; text: string }> = [
  { icon: ShieldCheck, text: "Your money moves only with your OK, or within limits you set." },
  { icon: Ticket, text: "Merchants are paid when the ticket is issued, not before." },
  { icon: ArrowUUpLeft, text: "Leftovers go back to whoever put them in." },
];

const steps: Array<{ icon: Icon; title: string; text: string }> = [
  {
    icon: UsersThree,
    title: "Start a trip",
    text: "Name it, pick the end date and share an invite link with your friends.",
  },
  {
    icon: Sparkle,
    title: "Ask the planner",
    text: "Say what the group is into. It finds things to do with real prices and times.",
  },
  {
    icon: SealCheck,
    title: "Approve your share",
    text: "Each person approves only their part. It books once everyone who's in has said yes.",
  },
];

// Illustration only: an example ticket rendered with the real component, never sent anywhere.
const exampleMembers = [
  { address: "0x00000000000000000000000000000000000000a1", displayName: "Angie" },
  { address: "0x00000000000000000000000000000000000000b2", displayName: "Bashy" },
  { address: "0x00000000000000000000000000000000000000c3", displayName: "Gitau" },
];
const [angie, , gitau] = exampleMembers.map((member) => member.address) as [string, string, string];
const exampleTicket: Proposal = {
  id: "example",
  tripId: "example",
  merchant: "0x00000000000000000000000000000000000000d4",
  merchantName: "Goa Adventures",
  title: "Tandem paragliding, Arambol",
  location: "Arambol beach, Goa",
  startsAt: "2026-12-12T04:30:00.000Z",
  total: "84000000",
  shares: [
    { member: angie, amount: "42000000", state: "approved" },
    { member: gitau, amount: "42000000", state: "waiting" },
  ],
  status: "pending",
  deadline: "2026-12-11T00:00:00.000Z",
  ticketHash: null,
  txHash: "0x00",
};

function HeroExample() {
  return (
    <figure aria-label="Example trip" className="relative">
      <div className="rounded-band bg-ink p-5 pb-24 text-card lg:p-6 lg:pb-28">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl font-semibold">India 26</p>
            <p className="text-sm text-card/75">Mumbai and Goa, 12 to 18 Dec</p>
          </div>
          <AvatarStack members={exampleMembers} onInk />
        </div>
        <p className="mt-5 max-w-[320px] rounded-ticket rounded-bl-sm bg-card/10 px-4 py-3 text-sm">
          Tandem paragliding over Arambol fits Saturday morning. I proposed it for Angie and Gitau.
        </p>
      </div>
      <div className="-mt-20 px-3 lg:-mt-24 lg:px-6">
        <ProposalTicket
          proposal={exampleTicket}
          members={exampleMembers}
          viewer={gitau}
          actions={
            <div className="flex gap-2.5" aria-hidden="true">
              <span className="flex h-12 flex-1 items-center justify-center rounded-control bg-coral font-semibold text-card">
                Approve my share
              </span>
              <span className="flex h-12 items-center justify-center rounded-control px-4 font-semibold text-ink ring-1 ring-inset ring-rule-strong">
                Not for me
              </span>
            </div>
          }
        />
      </div>
      <figcaption className="mt-3 text-center text-xs text-ink-muted">
        An example trip. Bashy isn't in this one, so his balance never moves.
      </figcaption>
    </figure>
  );
}

export function Landing() {
  const wallet = useWallet();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-10 lg:py-6">
        <Wordmark />
        <SignInButton label="Sign in" variant="secondary" className="h-11 px-4" />
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-6 pb-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:pt-12 lg:pb-24">
          <div className="flex flex-col gap-6">
            <div>
              <Chip tone="action">Group trips, one shared fund</Chip>
            </div>
            <h1 className="text-3xl text-balance lg:text-4xl">
              Plan the trip together. Pay only for your part.
            </h1>
            <p className="max-w-[520px] text-lg text-ink-muted">
              Rickshare is a shared trip fund for friends. A planner suggests things to do, and
              everyone approves their own share before any money moves.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SignInButton className="px-6" />
              <a
                href="#how"
                className="inline-flex h-12 items-center rounded-control px-4 font-semibold text-ink hover:bg-card"
              >
                How it works
              </a>
            </div>
            {!wallet.configured && (
              <p role="status" className="text-sm text-ink-muted">
                Sign-in is being set up. Please contact the trip organizer.
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-3">
              {promises.map(({ icon: PromiseIcon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-card text-coral shadow-card">
                    <PromiseIcon aria-hidden="true" size={20} />
                  </span>
                  <span className="pt-2">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden lg:block">
            <HeroExample />
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="border-t border-rule bg-card">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:px-10 lg:py-20">
            <h2 id="how-title" className="text-2xl lg:text-3xl">
              How it works
            </h2>
            <ol className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-10">
              {steps.map(({ icon: StepIcon, title, text }, index) => (
                <li key={title} className="relative flex items-start gap-4 lg:flex-col">
                  <div className="flex shrink-0 items-center gap-3 lg:w-full">
                    <span className="flex size-12 items-center justify-center rounded-pill bg-ink text-card">
                      <StepIcon aria-hidden="true" size={22} />
                    </span>
                    {index < steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="hidden h-0.5 flex-1 rounded-pill bg-rule lg:block"
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-semibold text-coral">Step {index + 1}</p>
                    <h3 className="text-xl">{title}</h3>
                    <p className="text-ink-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-10 lg:py-20">
          <div className="flex flex-col items-start gap-6 rounded-band bg-ink px-6 py-10 text-card lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:py-12">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl text-card lg:text-3xl">Ready for the next trip?</h2>
              <p className="text-card/75">
                Sign in with Google, email or the wallet you already use.
              </p>
            </div>
            <SignInButton className="px-6" />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pb-10 text-sm text-ink-muted lg:px-10">
        <Wordmark className="text-lg" />
        <p>Runs on Arc testnet with test USDC.</p>
      </footer>
    </div>
  );
}
