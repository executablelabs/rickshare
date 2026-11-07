import { CircleNotch, Sparkle, Ticket as TicketIcon } from "@phosphor-icons/react";
import type { ChatMessage, Proposal } from "@rickshare/shared";
import { useState } from "react";
import { useWallet } from "../../auth/wallet";
import { activityText } from "../../lib/activity-suggestions";
import { cx } from "../../lib/cx";
import { messageOf } from "../../lib/http";
import { fetchTicket } from "../../lib/plan";
import { isProposalExpired, useProposalExpiryNow } from "../../lib/proposal-expiry";
import { RickshawMark } from "../brand/RickshawMark";
import { useTripActions } from "../trips/TripActions";
import { Avatar, displayNameOf } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { ProposalTicket } from "./ProposalTicket";
import { ShareActions } from "./ShareActions";

export const SUGGESTIONS = [
  "Fun things to do on our trip",
  "Affordable activities for the group",
  "A dinner the whole group will like",
];

function PlannerAvatar() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-ink">
      <RickshawMark className="w-6 text-card" />
    </span>
  );
}

export function TicketLink({ proposal }: { proposal: Proposal }) {
  const { trip } = useTripActions();
  const showToast = useToast();
  const [opening, setOpening] = useState(false);
  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={opening}
      onClick={() => {
        const popup = window.open("", "_blank");
        if (popup) popup.opener = null;
        setOpening(true);
        fetchTicket(trip.id, proposal.id)
          .then((ticket) => {
            if (!["https:", "http:"].includes(new URL(ticket.url).protocol))
              throw new Error("This ticket link is invalid. Try again.");
            if (popup) popup.location.href = ticket.url;
            else window.location.assign(ticket.url);
          })
          .catch((error: unknown) => {
            popup?.close();
            showToast(messageOf(error), { tone: "error" });
          })
          .finally(() => setOpening(false));
      }}
    >
      <TicketIcon aria-hidden="true" size={20} />
      {opening ? "Opening ticket…" : "View my ticket"}
    </Button>
  );
}

function Bubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  const { trip } = useTripActions();
  const wallet = useWallet();
  const mine = message.author?.toLowerCase() === wallet.address?.toLowerCase();
  const author = trip.members.find(
    (member) => member.address.toLowerCase() === message.author?.toLowerCase(),
  );

  if (message.role === "agent")
    return (
      <div className="flex items-end gap-2.5">
        <PlannerAvatar />
        <div className="flex max-w-[85%] flex-col gap-1">
          <span className="text-xs font-semibold text-ink-muted">Planner</span>
          <p className="rounded-ticket rounded-bl-sm border border-rule bg-card px-4 py-3 whitespace-pre-wrap wrap-anywhere">
            {activityText(message.text)}
          </p>
        </div>
      </div>
    );

  if (mine)
    return (
      <div className="flex justify-end">
        <p
          className={cx(
            "max-w-[85%] rounded-ticket rounded-br-sm bg-ink px-4 py-3 whitespace-pre-wrap wrap-anywhere text-card",
            pending && "opacity-70",
          )}
        >
          {message.text}
        </p>
      </div>
    );

  return (
    <div className="flex items-end gap-2.5">
      <Avatar
        name={author?.displayName ?? "Member"}
        colorKey={message.author ?? undefined}
        size="sm"
        className="mb-0.5"
      />
      <div className="flex max-w-[85%] flex-col gap-1">
        <span className="text-xs font-semibold text-ink-muted">
          {author ? displayNameOf(author.displayName) : "A member"}
        </span>
        <p className="rounded-ticket rounded-bl-sm bg-card px-4 py-3 whitespace-pre-wrap wrap-anywhere ring-1 ring-rule">
          {message.text}
        </p>
      </div>
    </div>
  );
}

export function Feed({
  messages,
  proposals,
  thinking,
  onSuggest,
}: {
  messages: ChatMessage[];
  proposals: Proposal[];
  thinking: boolean;
  onSuggest: (text: string) => void;
}) {
  const { trip } = useTripActions();
  const wallet = useWallet();
  const [pressed, setPressed] = useState<string | undefined>();
  const location = trip.location?.trim();
  const suggestions = location
    ? [
        `Fun things to do in ${location}`,
        `Affordable activities in ${location}`,
        `A group dinner in ${location}`,
      ]
    : SUGGESTIONS;
  const now = useProposalExpiryNow(proposals);
  const activeProposals = proposals.filter((proposal) => !isProposalExpired(proposal, now));
  const byId = new Map(activeProposals.map((proposal) => [proposal.id, proposal]));
  const attachedIds = new Set(messages.flatMap((message) => message.proposalIds));

  function proposalCard(proposal: Proposal) {
    const isParticipant = proposal.shares.some(
      (share) => share.member.toLowerCase() === wallet.address?.toLowerCase(),
    );
    return (
      <ProposalTicket
        proposal={proposal}
        members={trip.members}
        viewer={wallet.address}
        pressed={pressed}
        actions={<ShareActions proposal={proposal} onApproved={setPressed} />}
        footer={
          proposal.status === "fulfilled" && isParticipant ? (
            <TicketLink proposal={proposal} />
          ) : undefined
        }
      />
    );
  }

  if (messages.length === 0 && activeProposals.length === 0 && !thinking)
    return (
      <section aria-labelledby="ask-title" className="travel-empty flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-sky text-ink">
            <Sparkle aria-hidden="true" size={20} />
          </span>
          <h2 id="ask-title" className="min-w-0 text-xl wrap-anywhere">
            {location ? `Explore ${location}` : "Ask for ideas"}
          </h2>
        </div>
        <p className="wrap-anywhere text-ink-muted">
          {location
            ? `Tell the planner what you'd love to do in ${location}.`
            : "Share where you're headed and what the group enjoys."}{" "}
          Choose your favorites, then approve your own share before booking.
        </p>
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => onSuggest(suggestion)}
                className="min-h-11 rounded-pill bg-paper px-4 text-left text-sm font-semibold wrap-anywhere text-ink ring-1 ring-inset ring-rule hover:ring-rule-strong"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <ol aria-label="Messages" className="flex flex-col gap-5">
      {messages.map((message) => (
        <li key={message.id} className="flex flex-col gap-3">
          <Bubble message={message} pending={message.id.startsWith("pending:")} />
          {message.proposalIds.map((id) => {
            const proposal = byId.get(id);
            if (!proposal) return null;
            return (
              <div key={id} className="lg:pl-11.5">
                {proposalCard(proposal)}
              </div>
            );
          })}
        </li>
      ))}
      {activeProposals
        .filter((proposal) => !attachedIds.has(proposal.id))
        .map((proposal) => (
          <li key={`purchase:${proposal.id}`} className="lg:pl-11.5">
            {proposalCard(proposal)}
          </li>
        ))}
      {thinking && (
        <li className="flex items-end gap-2.5" role="status">
          <PlannerAvatar />
          <p className="flex items-center gap-2 rounded-ticket rounded-bl-sm bg-card px-4 py-3 text-ink-muted shadow-card">
            <CircleNotch
              aria-hidden="true"
              size={16}
              className="animate-spin motion-reduce:animate-none"
            />
            Planning…
          </p>
        </li>
      )}
    </ol>
  );
}
