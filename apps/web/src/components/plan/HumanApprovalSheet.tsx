import type { HumanApprovalChallenge } from "@rickshare/shared";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import { useEffect, useRef, useState } from "react";
import { config } from "../../config";
import { formatUsd } from "../../lib/format-usd";
import { ApiError, messageOf } from "../../lib/http";
import { type Attestation, worldApi } from "../../lib/world";
import { Amount } from "../ui/Amount";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

function approvalErrorMessage(failure: unknown) {
  if (
    failure instanceof ApiError &&
    ["WORLD_EXPIRED", "ATTESTATION_EXPIRED"].includes(failure.code)
  )
    return "This approval expired. Start a fresh approval to get a new World ID challenge.";
  return failure instanceof Error ? failure.message : messageOf(failure);
}

export default function HumanApprovalSheet({
  requestId,
  challenge,
  onVerified,
  onCancel,
  onRestart,
}: {
  requestId: string;
  challenge: HumanApprovalChallenge;
  onVerified: (attestation: Attestation) => Promise<void>;
  onCancel: (error?: string) => void;
  onRestart?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expired, setExpired] = useState(challenge.rpContext.expires_at * 1000 <= Date.now());
  const cancelled = useRef(false);
  const completed = useRef(false);
  const autoOpenedRequest = useRef<string | undefined>(undefined);
  const webhook = new URL(
    `${config.VITE_API_URL.replace(/\/$/, "")}/world/requests/${encodeURIComponent(requestId)}/proof`,
    window.location.origin,
  );
  const sameOrigin = webhook.origin === window.location.origin;
  useEffect(() => {
    if (
      autoOpenedRequest.current === requestId ||
      cancelled.current ||
      completed.current ||
      !sameOrigin ||
      challenge.rpContext.expires_at * 1000 <= Date.now()
    )
      return;
    autoOpenedRequest.current = requestId;
    setDismissed(false);
    setOpen(true);
  }, [requestId, sameOrigin, challenge.rpContext.expires_at]);

  useEffect(() => {
    setExpired(challenge.rpContext.expires_at * 1000 <= Date.now());
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
    setChecking(true);
    setDismissed(false);
    setOpen(false);
    try {
      const result = await worldApi.request(requestId);
      if (result.status !== "verified" || !result.attestation)
        throw new Error("World has not verified this share. Start a fresh approval.");
      if (!cancelled.current) await onVerified(result.attestation);
    } catch (failure) {
      setError(approvalErrorMessage(failure));
      completed.current = false;
    } finally {
      setChecking(false);
    }
  }

  const blockedReason = expired
    ? "This approval expired, possibly while you were signing in to World. Start a fresh approval to get a new challenge."
    : !sameOrigin
      ? "World human approvals require the same-origin API proxy. Use the hosted app or the documented local HTTPS setup."
      : undefined;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) void cancel();
      }}
      title="Confirm this activity share"
      description="Confirm this activity’s World ID proof, then continue to your wallet to approve your share."
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-muted">World authentication complete</p>
        <div>
          <p className="text-sm text-ink-muted">Your share</p>
          <Amount value={BigInt(challenge.share.amount)} className="text-2xl" />
          <p className="mt-2 text-sm text-ink-muted">
            This approval is for this purchase and your share only.
          </p>
        </div>
        {blockedReason && <p role="alert">{blockedReason}</p>}
        {error && <p role="alert">{error}</p>}
        {!blockedReason && (
          <p role="status">
            {checking
              ? "Checking your approval. Your wallet is next…"
              : verifying
                ? "Verifying this activity share…"
                : dismissed
                  ? "Verification was closed. Reopen it to confirm this activity share."
                  : "Confirm this activity share in World ID. Your wallet is next."}
          </p>
        )}
        {!blockedReason && dismissed && !verifying && !checking && (
          <Button
            fullWidth
            disabled={verifying || checking}
            onClick={() => {
              if (challenge.rpContext.expires_at * 1000 <= Date.now()) {
                setExpired(true);
                return;
              }
              setError(undefined);
              setDismissed(false);
              setOpen(true);
            }}
          >
            Open verification again
          </Button>
        )}
        {(blockedReason || error) && onRestart && (
          <Button fullWidth onClick={onRestart}>
            Start fresh approval
          </Button>
        )}
        {(blockedReason || error) && !onRestart && (
          <p>Cancel this approval, then choose “Approve my share” again.</p>
        )}
        <Button variant="secondary" fullWidth onClick={() => void cancel()}>
          Cancel approval
        </Button>
        {error && (
          <Button
            variant="secondary"
            fullWidth
            disabled={verifying || checking}
            onClick={() => void complete()}
          >
            Check approval status
          </Button>
        )}
        {open && (
          <IDKitRequestWidget
            open
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setDismissed(true);
            }}
            app_id={challenge.appId as `app_${string}`}
            action={challenge.action}
            action_description={`Approve my ${formatUsd(BigInt(challenge.share.amount))} share for Rickshare purchase ${challenge.share.proposalId}`}
            rp_context={challenge.rpContext}
            preset={proofOfHuman({ signal: challenge.signal })}
            environment={challenge.environment ?? "production"}
            allow_legacy_proofs={false}
            handleVerify={async (proof) => {
              setVerifying(true);
              try {
                if (cancelled.current || challenge.rpContext.expires_at * 1000 <= Date.now())
                  throw new ApiError("WORLD_EXPIRED", "This approval expired.", 409);
                await worldApi.verifyApprovalProof(requestId, proof);
              } catch (failure) {
                if (
                  failure instanceof ApiError &&
                  ["WORLD_EXPIRED", "ATTESTATION_EXPIRED"].includes(failure.code)
                )
                  setExpired(true);
                setError(approvalErrorMessage(failure));
                throw failure;
              } finally {
                setVerifying(false);
              }
            }}
            onSuccess={complete}
            onError={() =>
              setError(
                (current) =>
                  current ??
                  (challenge.rpContext.expires_at * 1000 <= Date.now()
                    ? "This approval expired. Start a fresh approval."
                    : "World ID verification did not finish. Check its status or cancel and start again."),
              )
            }
          />
        )}
      </div>
    </Sheet>
  );
}
