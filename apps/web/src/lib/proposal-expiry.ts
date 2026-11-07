import type { Proposal } from "@rickshare/shared";
import { useEffect, useState } from "react";

/** Legacy proposals without a quote expiry keep their proposal deadline. */
export function approvalCutoff(proposal: Proposal): number {
  return Math.min(
    Date.parse(proposal.deadline),
    proposal.quoteExpiresAt ? Date.parse(proposal.quoteExpiresAt) : Number.POSITIVE_INFINITY,
  );
}

export function isProposalExpired(proposal: Proposal, now = Date.now()): boolean {
  return proposal.status === "pending" && approvalCutoff(proposal) <= now;
}

/** Re-render at the next cutoff, and reconcile timers delayed by a backgrounded tab. */
export function useProposalExpiryNow(proposals: readonly Proposal[]): number {
  const [now, setNow] = useState(Date.now);
  const current = Math.max(now, Date.now());
  const nextCutoff = Math.min(
    ...proposals
      .filter((proposal) => proposal.status === "pending")
      .map(approvalCutoff)
      .filter((cutoff) => cutoff > current),
  );

  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      setNow(Date.now());
      if (Number.isFinite(nextCutoff) && nextCutoff > Date.now())
        timer = window.setTimeout(update, Math.min(nextCutoff - Date.now(), 2147483647));
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [nextCutoff]);

  return current;
}
