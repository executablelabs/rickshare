import type { HumanApprovalChallenge } from "@rickshare/shared";
import { useHumanApproval } from "@worldcoin/human-in-the-loop-react";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "../../config";
import { formatUsd } from "../../lib/format-usd";
import { messageOf } from "../../lib/http";
import { type Attestation, worldApi } from "../../lib/world";
import { Amount } from "../ui/Amount";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

export default function HumanApprovalSheet({
  requestId,
  challenge,
  onVerified,
  onCancel,
}: {
  requestId: string;
  challenge: HumanApprovalChallenge;
  onVerified: (attestation: Attestation) => Promise<void>;
  onCancel: (error?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(challenge.rpContext.expires_at * 1000 <= Date.now());
  const cancelled = useRef(false);
  const completed = useRef(false);
  const part = useMemo(
    () => ({
      type: "tool-worldApproval" as const,
      toolCallId: requestId,
      state: "input-available" as const,
      input: challenge.share,
    }),
    [requestId, challenge],
  );
  const webhook = new URL(
    `${config.VITE_API_URL.replace(/\/$/, "")}/world/requests/${encodeURIComponent(requestId)}/proof`,
    window.location.origin,
  );
  const sameOrigin = webhook.origin === window.location.origin;
  const message = useMemo<UIMessage>(
    () => ({
      id: requestId,
      role: "assistant",
      parts: [
        part,
        {
          type: "data-approval-context",
          id: requestId,
          data: {
            webhookUrl: webhook.href,
            action: challenge.action,
            rpContext: challenge.rpContext,
          },
        },
      ],
    }),
    [requestId, part, webhook.href, challenge],
  );
  const approval = useHumanApproval(message, part);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.max(0, Math.min(challenge.rpContext.expires_at * 1000 - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [challenge.rpContext.expires_at]);

  async function cancel() {
    cancelled.current = true;
    setOpen(false);
    try {
      await worldApi.cancel(requestId);
      onCancel();
    } catch (failure) {
      onCancel(messageOf(failure));
    }
  }

  async function complete() {
    if (cancelled.current || completed.current) return;
    completed.current = true;
    setOpen(false);
    try {
      const result = await worldApi.request(requestId);
      if (result.status !== "verified" || !result.attestation)
        throw new Error("World has not verified this share. Start a fresh approval.");
      if (!cancelled.current) await onVerified(result.attestation);
    } catch (failure) {
      setError(messageOf(failure));
      completed.current = false;
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) void cancel();
      }}
      title="Approve with World ID"
      description="Confirm your exact share with a World ID proof. Your wallet will confirm the transaction afterward."
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-ticket border border-rule bg-paper p-4">
          <p className="text-sm text-ink-muted">Your share</p>
          <Amount value={BigInt(challenge.share.amount)} className="text-2xl" />
          <p className="mt-2 text-sm text-ink-muted">
            This approval is for this purchase and your share only.
          </p>
        </div>
        {!sameOrigin && (
          <p role="alert">
            World human approvals require the same-origin API proxy. Use the hosted app or the
            documented local HTTPS setup.
          </p>
        )}
        {expired && <p role="alert">This approval expired. Cancel and start a fresh approval.</p>}
        {(error || approval.state.status === "error") && (
          <p role="alert">
            {error ?? (approval.state.status === "error" ? approval.state.error.message : "")}
          </p>
        )}
        <Button
          fullWidth
          disabled={
            expired || !sameOrigin || !approval.ready || approval.state.status === "verifying"
          }
          onClick={() => setOpen(true)}
        >
          {approval.state.status === "verifying"
            ? "Verifying your approval…"
            : "Verify and approve my share"}
        </Button>
        <Button variant="secondary" fullWidth onClick={() => void cancel()}>
          Cancel approval
        </Button>
        {approval.state.status === "error" && (
          <Button variant="secondary" fullWidth onClick={() => void complete()}>
            Check approval status
          </Button>
        )}
        {open && (
          <IDKitRequestWidget
            open
            onOpenChange={setOpen}
            app_id={challenge.appId as `app_${string}`}
            action={approval.action ?? challenge.action}
            action_description={`Approve my ${formatUsd(BigInt(challenge.share.amount))} share for Rickshare purchase ${challenge.share.proposalId}`}
            rp_context={challenge.rpContext}
            preset={proofOfHuman({ signal: challenge.signal })}
            environment="production"
            allow_legacy_proofs={false}
            handleVerify={async (proof) => {
              try {
                await approval.verify(proof);
              } catch (failure) {
                setError(
                  "World did not verify this share. Check its status or cancel and start again.",
                );
                throw failure;
              }
            }}
            onSuccess={complete}
            onError={() =>
              setError("World ID verification did not finish. Try again or cancel this approval.")
            }
          />
        )}
      </div>
    </Sheet>
  );
}
