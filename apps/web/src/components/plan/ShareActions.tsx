import type { HumanApprovalChallenge, Proposal } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
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
type Phase = "idle" | "verifying" | "human" | "finishing" | "signing" | "declining";

const approveLabel: Record<Phase, string> = {
  idle: "Approve my share",
  verifying: "Verifying with World…",
  human: "Waiting for human approval…",
  finishing: "Finishing approval",
  signing: "Confirm in wallet",
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
  const sending = useRef(false);
  const attemptedRequests = useRef(new Set<string>());
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

  async function submitApproval(
    attestation: Attestation,
    requestId?: string,
    active: () => boolean = () => true,
  ) {
    if (sending.current) return;
    sending.current = true;
    const submissionKey = `rickshare:approval:${trip.vaultAddress.toLowerCase()}:${proposal.id}:${wallet.address?.toLowerCase()}`;
    try {
      if (!me) throw new Error("Your trip membership changed. Refresh the trip.");
      setPhase("finishing");
      await queryClient.invalidateQueries(
        { queryKey: planKeys.proposals(trip.id) },
        { throwOnError: true },
      );
      if (!active()) return;
      const current = queryClient
        .getQueryData<Proposal[]>(planKeys.proposals(trip.id))
        ?.find((entry) => entry.id === proposal.id);
      if (!current) throw new Error("Refresh the plan before continuing in your wallet.");
      const share = current.shares.find(
        (entry) => entry.member.toLowerCase() === me.address.toLowerCase(),
      );
      if (!share) throw new Error("This purchase no longer includes you. Refresh the plan.");
      if (
        ["approved", "auto"].includes(share.state) ||
        ["locked", "fulfilled"].includes(current.status)
      ) {
        window.localStorage.removeItem(submissionKey);
        clearWorldReturn();
        showToast(
          current.status === "fulfilled"
            ? "Ticket ready"
            : current.status === "locked"
              ? "Funds locked"
              : current.shares.some(
                    (entry) =>
                      entry.state === "waiting" &&
                      entry.member.toLowerCase() !== me.address.toLowerCase(),
                  )
                ? "Your share is approved. Waiting for other participants."
                : "Your share is approved. Finishing approval.",
        );
        await refresh();
        return;
      }
      if (current.status !== "pending" || share.state !== "waiting" || isProposalExpired(current))
        throw new ApiError(
          "APPROVAL_CONTEXT_MISMATCH",
          "This share is no longer awaiting approval. Refresh the plan.",
          409,
        );
      if (BigInt(attestation.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
        throw new ApiError(
          "ATTESTATION_EXPIRED",
          "Your verification expired. Approve again to retry.",
          409,
        );
      }
      const call = approveCall(trip.vaultAddress, attestation, {
        proposalId: proposal.id,
        member: me.address,
        amount: share.amount,
        deadline: new Date(approvalCutoff(current)).toISOString(),
      });
      if (window.localStorage.getItem(submissionKey))
        throw new Error(
          "A wallet approval may still be pending. Check your wallet and refresh the plan before trying again.",
        );
      const attemptKey = requestId ? `${submissionKey}:request:${requestId}` : null;
      const attestationKey = `${submissionKey}:attestation:${attestation.signature}`;
      if (
        (requestId && attemptedRequests.current.has(requestId)) ||
        (attemptKey && window.localStorage.getItem(attemptKey)) ||
        window.localStorage.getItem(attestationKey)
      )
        throw new Error(
          "This World approval already reached your wallet. Check your wallet and refresh the plan.",
        );
      // A reload or uncertain receipt must not rebroadcast this purchase approval.
      if (requestId && attemptKey) {
        window.localStorage.setItem(attemptKey, "attempted");
        attemptedRequests.current.add(requestId);
      }
      window.localStorage.setItem(attestationKey, "attempted");
      window.localStorage.setItem(submissionKey, "pending");
      setPhase("signing");
      await wallet.sendTransaction(call);
      setPhase("finishing");
      window.localStorage.removeItem(submissionKey);
      onApproved(me.address);
      clearWorldReturn();
      showToast("Share approved. Finishing approval.");
      await refresh();
      const updated = queryClient
        .getQueryData<Proposal[]>(planKeys.proposals(trip.id))
        ?.find((entry) => entry.id === proposal.id);
      if (updated?.status === "locked") showToast("Funds locked");
      else if (updated?.status === "fulfilled") showToast("Ticket ready");
      else if (
        updated?.status === "pending" &&
        updated.shares.some(
          (entry) =>
            entry.state === "waiting" && entry.member.toLowerCase() !== me.address.toLowerCase(),
        )
      )
        showToast("Waiting for other participants");
    } catch (error) {
      if (
        error instanceof Error &&
        /user rejected|user denied|user cancel|cancelled in your wallet/i.test(error.message)
      ) {
        window.localStorage.removeItem(submissionKey);
        clearWorldReturn();
      }
      if (
        error instanceof Error &&
        (/reverted|insufficient funds|exceeds balance/i.test(error.message) ||
          error.message === "The transaction failed, so nothing in the trip changed. Try again.")
      ) {
        window.localStorage.removeItem(submissionKey);
        clearWorldReturn();
      }
      throw error;
    } finally {
      sending.current = false;
    }
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
