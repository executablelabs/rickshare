import { CalendarBlank, MapPin, Storefront } from "@phosphor-icons/react";
import type { Member, Proposal } from "@rickshare/shared";
import { type ReactNode, useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { formatWhen } from "../../lib/format-date";
import { Amount } from "../ui/Amount";
import { Avatar } from "../ui/Avatar";
import { Chip } from "../ui/Chip";

type Share = Proposal["shares"][number];
type StampKind = "approved" | "waiting" | "declined" | "out";

const stampRing: Record<StampKind, string> = {
  approved: "ring-2 ring-stamp ring-offset-2 ring-offset-card",
  waiting: "ring-2 ring-marigold ring-offset-2 ring-offset-card",
  declined: "ring-2 ring-declined ring-offset-2 ring-offset-card",
  out: "opacity-60 ring-1 ring-rule",
};
const stampLabel: Record<StampKind, string> = {
  approved: "Approved",
  waiting: "Waiting",
  declined: "Declined",
  out: "Not in",
};

function stampOf(share: Share | undefined): StampKind {
  if (!share) return "out";
  if (share.state === "approved" || share.state === "auto") return "approved";
  return share.state === "rejected" ? "declined" : "waiting";
}

/** What the ticket says about itself, from the viewer's point of view. */
export function ticketStatus(proposal: Proposal, viewer: string | undefined, now = Date.now()) {
  const mine = proposal.shares.find(
    (share) => share.member.toLowerCase() === viewer?.toLowerCase(),
  );
  switch (proposal.status) {
    case "rejected":
      return { label: "Declined", tone: "declined", mine } as const;
    case "refunded":
      return { label: "Refunded", tone: "neutral", mine } as const;
    case "fulfilled":
      return { label: "Ticket ready", tone: "stamp", mine } as const;
    case "locked":
      return { label: "Everyone's in", tone: "stamp", mine } as const;
    default:
      if (Date.parse(proposal.deadline) <= now)
        return { label: "Expired", tone: "neutral", mine } as const;
      if (!mine) return { label: "Not for you", tone: "neutral", mine } as const;
      if (mine.state === "waiting")
        return { label: "Waiting for you", tone: "action", mine } as const;
      return { label: "Waiting on others", tone: "waiting", mine } as const;
  }
}

export interface ProposalTicketProps {
  proposal: Proposal;
  members: Array<Pick<Member, "address" | "displayName">>;
  viewer: string | undefined;
  /** Approve and decline buttons, shown only while the viewer's share waits for them. */
  actions?: ReactNode;
  /** Extra footer content, such as a ticket link. */
  footer?: ReactNode;
  /** A member whose stamp just landed, to play the stamp press once. */
  pressed?: string | undefined;
  className?: string;
}

export function ProposalTicket({
  proposal,
  members,
  viewer,
  actions,
  footer,
  className,
  pressed,
}: ProposalTicketProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (proposal.status !== "pending" || Date.parse(proposal.deadline) <= now) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(Date.parse(proposal.deadline) - Date.now(), 2147483647)),
    );
    return () => window.clearTimeout(timer);
  }, [proposal.deadline, proposal.status, now]);
  const status = ticketStatus(proposal, viewer, now);
  const waitingForYou = status.tone === "action";

  if (!status.mine && proposal.status === "pending")
    return (
      <article
        aria-label={proposal.title}
        className={cx(
          "flex items-center justify-between gap-3 rounded-ticket bg-card px-5 py-3.5 ring-1 ring-rule",
          className,
        )}
      >
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate font-display text-base font-semibold">{proposal.title}</h3>
          <p className="text-xs text-ink-muted">Not part of this one. Your balance doesn't move.</p>
        </div>
        <Chip>Not for you</Chip>
      </article>
    );

  return (
    <article
      aria-label={proposal.title}
      className={cx("relative overflow-hidden rounded-ticket bg-card shadow-card", className)}
    >
      {waitingForYou && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-coral" />
      )}
      <div className="flex flex-col gap-1 px-5 pt-4 pb-3.5">
        <div>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        <h3 className="mt-2 font-display text-xl font-semibold">{proposal.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Storefront aria-hidden="true" size={16} className="shrink-0" />
          {proposal.merchantName}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <CalendarBlank aria-hidden="true" size={16} className="shrink-0" />
          {formatWhen(proposal.startsAt)}
        </p>
        {proposal.location && (
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin aria-hidden="true" size={16} className="shrink-0" />
            {proposal.location}
          </p>
        )}
        <div className="mt-2.5 flex items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-ink-muted">Total</span>
            <Amount value={BigInt(proposal.total)} />
          </div>
          {status.mine && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-ink-muted">Your share</span>
              <Amount value={BigInt(status.mine.amount)} display className="text-2xl" />
            </div>
          )}
        </div>
      </div>

      {/* Perforation: a dashed rule with paper-colored notches cut into both edges. */}
      <div aria-hidden="true" className="relative flex h-4.5 items-center">
        <span className="absolute -left-2.5 size-4.5 rounded-pill bg-paper" />
        <span className="mx-4 flex-1 border-t-2 border-dashed border-rule" />
        <span className="absolute -right-2.5 size-4.5 rounded-pill bg-paper" />
      </div>

      <div className="flex flex-col gap-4 px-5 pt-3 pb-5">
        <ul aria-label="Who is in" className="flex flex-wrap gap-x-5 gap-y-3">
          {members.map((member) => {
            const kind = stampOf(
              proposal.shares.find(
                (share) => share.member.toLowerCase() === member.address.toLowerCase(),
              ),
            );
            return (
              <li key={member.address} className="flex flex-col items-center gap-1">
                <Avatar
                  name={member.displayName}
                  colorKey={member.address}
                  className={cx(
                    stampRing[kind],
                    kind === "approved" && "-rotate-2",
                    kind === "approved" &&
                      member.address.toLowerCase() === pressed?.toLowerCase() &&
                      "animate-stamp motion-reduce:animate-none",
                  )}
                />
                <span
                  className={cx(
                    "text-xs",
                    kind === "approved" ? "font-semibold text-stamp-ink" : "text-ink-muted",
                  )}
                >
                  {stampLabel[kind]}
                </span>
              </li>
            );
          })}
        </ul>
        {waitingForYou && actions}
        {footer}
      </div>
    </article>
  );
}
