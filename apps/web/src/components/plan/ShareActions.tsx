import type { HumanApprovalChallenge, Proposal } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { toWalletCall, useWallet } from "../../auth/wallet";
import { ApiError, messageOf } from "../../lib/http";
import { approveCall, planKeys } from "../../lib/plan";
import { approvalCutoff, isProposalExpired, useProposalExpiryNow } from "../../lib/proposal-expiry";
import { memberOf, prepareMoneyAction, tripKeys } from "../../lib/trips";
import { type Attestation, verifyWithWorld, worldApi } from "../../lib/world";
import { Loader } from "../brand/Loader";
import { useTripActions } from "../trips/TripActions";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

const HumanApprovalSheet = lazy(() => import("./HumanApprovalSheet"));
const expiredMessage =
  "This proposal expired. Ask the planner for a new proposal, then approve again.";
type Phase = "idle" | "verifying" | "human" | "signing" | "declining";

const approveLabel: Record<Phase, string> = {
  idle: "Approve my share",
  verifying: "Verifying with World…",
  human: "Waiting for human approval…",
  signing: "Confirm in your wallet…",
  declining: "Approve my share",
};

/**
 * Approve my share: a fresh World check for this exact share, then the vault's approve from the
 * member's own wallet. Not for me: the prepared reject. Neither can touch anyone else's share.
 */
export function ShareActions({
  proposal,
  onApproved,
}: {
  proposal: Proposal;
  onApproved: (member: string) => void;
}) {
  const { trip, linkWorld, linkingWorld } = useTripActions();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [humanApproval, setHumanApproval] = useState<{
    requestId: string;
    challenge: HumanApprovalChallenge;
  } | null>(null);
  const me = memberOf(trip, wallet.address);
  const now = useProposalExpiryNow([proposal]);
  const expired = isProposalExpired(proposal, now);
  const busy = phase !== "idle" || linkingWorld;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: planKeys.proposals(trip.id) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.one(trip.id) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.money(trip.id) }),
      queryClient.invalidateQueries({ queryKey: ["trips", trip.id, "itinerary"] }),
    ]);

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.code === "PROPOSAL_EXPIRED") {
      showToast(expiredMessage, { tone: "error" });
      void refresh();
      return;
    }
    showToast(messageOf(error), { tone: "error" });
  }

  function requireUnexpired() {
    if (isProposalExpired(proposal)) throw new ApiError("PROPOSAL_EXPIRED", expiredMessage, 409);
  }

  async function submitApproval(attestation: Attestation) {
    requireUnexpired();
    if (!me) throw new Error("Your trip membership changed. Refresh the trip.");
    setPhase("signing");
    const share = proposal.shares.find(
      (entry) => entry.member.toLowerCase() === me.address.toLowerCase(),
    );
    if (!share) throw new Error("This purchase no longer includes you. Refresh the plan.");
    await wallet.sendTransaction(
      approveCall(trip.vaultAddress, attestation, {
        proposalId: proposal.id,
        member: me.address,
        amount: share.amount,
        deadline: new Date(approvalCutoff(proposal)).toISOString(),
      }),
    );
    onApproved(me.address);
    showToast("Share approved");
    await refresh();
  }

  function approve() {
    if (isProposalExpired(proposal)) {
      handleError(new ApiError("PROPOSAL_EXPIRED", expiredMessage, 409));
      return;
    }
    if (!me) return;
    if (!me.worldLinked) {
      // Approvals need a World identity linked once; start that, then approve again.
      showToast("Verify with World first, then approve your share.");
      linkWorld();
      return;
    }
    setPhase("verifying");
    const resumeRequest = new URLSearchParams(window.location.search).get("world_request");
    // Called straight from the click so the World popup is allowed to open.
    const verification = resumeRequest
      ? worldApi.request(resumeRequest).then((state) => ({ ...state, requestId: resumeRequest }))
      : verifyWithWorld(() => worldApi.startApproval(trip.id, proposal.id));
    verification
      .then(async (result) => {
        requireUnexpired();
        if (result.status === "awaiting_proof") {
          if (!result.humanApproval || !("requestId" in result))
            throw new Error("World did not return a human approval request. Try again.");
          const approvedShare = result.humanApproval.share;
          const expectedShare = proposal.shares.find(
            (share) => share.member.toLowerCase() === me.address.toLowerCase(),
          );
          if (
            approvedShare.vaultAddress.toLowerCase() !== trip.vaultAddress.toLowerCase() ||
            approvedShare.member.toLowerCase() !== me.address.toLowerCase() ||
            approvedShare.proposalId !== proposal.id ||
            !expectedShare ||
            BigInt(approvedShare.amount) !== BigInt(expectedShare.amount)
          )
            throw new Error("This World approval does not match your share. Start again.");
          setHumanApproval({ requestId: result.requestId, challenge: result.humanApproval });
          setPhase("human");
          if (resumeRequest) clearWorldReturn();
          return;
        }
        if (!result.attestation) throw new Error("World did not return an approval. Try again.");
        if (resumeRequest) clearWorldReturn();
        await submitApproval(result.attestation);
      })
      .catch((error: unknown) => {
        if (resumeRequest) clearWorldReturn();
        handleError(error);
      })
      .finally(() => setPhase((current) => (current === "human" ? current : "idle")));
  }

  function clearWorldReturn() {
    const url = new URL(window.location.href);
    url.searchParams.delete("world_request");
    url.searchParams.delete("world_status");
    window.history.replaceState(window.history.state, "", url.toString());
  }

  async function decline() {
    setPhase("declining");
    try {
      requireUnexpired();
      const transactions = await prepareMoneyAction(trip.id, {
        action: "reject",
        proposalId: proposal.id,
      });
      for (const transaction of transactions)
        await wallet.sendTransaction(toWalletCall(transaction));
      showToast("Marked not for you");
      await refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <>
      <div className="flex gap-2.5">
        <Button fullWidth disabled={busy || expired} onClick={approve}>
          {linkingWorld ? "Verifying with World…" : approveLabel[phase]}
        </Button>
        <Button variant="secondary" disabled={busy || expired} onClick={() => void decline()}>
          {phase === "declining" ? "Declining…" : "Not for me"}
        </Button>
      </div>
      {humanApproval && (
        <Suspense fallback={<Loader label="Loading human approval" />}>
          <HumanApprovalSheet
            key={humanApproval.requestId}
            {...humanApproval}
            onVerified={async (attestation) => {
              try {
                await submitApproval(attestation);
              } catch (error) {
                handleError(error);
              } finally {
                setHumanApproval(null);
                setPhase("idle");
              }
            }}
            onCancel={(error) => {
              if (error) showToast(error, { tone: "error" });
              setHumanApproval(null);
              setPhase("idle");
            }}
          />
        </Suspense>
      )}
    </>
  );
}
