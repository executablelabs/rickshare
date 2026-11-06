import type { Proposal } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toWalletCall, useWallet } from "../../auth/wallet";
import { messageOf } from "../../lib/http";
import { approveCall, planKeys } from "../../lib/plan";
import { memberOf, prepareMoneyAction, tripKeys } from "../../lib/trips";
import { verifyWithWorld, worldApi } from "../../lib/world";
import { useTripActions } from "../trips/TripActions";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

type Phase = "idle" | "verifying" | "signing" | "declining";

const approveLabel: Record<Phase, string> = {
  idle: "Approve my share",
  verifying: "Verifying with World…",
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
  const me = memberOf(trip, wallet.address);
  const busy = phase !== "idle" || linkingWorld;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: planKeys.proposals(trip.id) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.one(trip.id) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.money(trip.id) }),
    ]);

  function approve() {
    if (!me) return;
    if (!me.worldLinked) {
      // Approvals need a World identity linked once; start that, then approve again.
      showToast("Verify with World first, then approve your share.");
      linkWorld();
      return;
    }
    setPhase("verifying");
    // Called straight from the click so the World popup is allowed to open.
    verifyWithWorld(() => worldApi.startApproval(trip.id, proposal.id))
      .then(async (result) => {
        if (!result.attestation) throw new Error("World did not return an approval. Try again.");
        setPhase("signing");
        await wallet.sendTransaction(approveCall(trip.vaultAddress, result.attestation));
        onApproved(me.address);
        showToast("Share approved");
        await refresh();
      })
      .catch((error: unknown) => showToast(messageOf(error), { tone: "error" }))
      .finally(() => setPhase("idle"));
  }

  async function decline() {
    setPhase("declining");
    try {
      const transactions = await prepareMoneyAction(trip.id, {
        action: "reject",
        proposalId: proposal.id,
      });
      for (const transaction of transactions)
        await wallet.sendTransaction(toWalletCall(transaction));
      showToast("Marked not for you");
      await refresh();
    } catch (error) {
      showToast(messageOf(error), { tone: "error" });
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="flex gap-2.5">
      <Button fullWidth disabled={busy} onClick={approve}>
        {linkingWorld ? "Verifying with World…" : approveLabel[phase]}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => void decline()}>
        {phase === "declining" ? "Declining…" : "Not for me"}
      </Button>
    </div>
  );
}
