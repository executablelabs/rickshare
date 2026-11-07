import { Address, HumanApprovalChallenge, UsdcAmount } from "@rickshare/shared";
import { z } from "zod";
import { api } from "./api";
import { ApiError, readApi } from "./http";

const Started = z.object({ requestId: z.string(), authorizationUrl: z.string().url() });
const Attestation = z.object({
  vaultAddress: Address,
  proposalId: UsdcAmount,
  member: Address,
  amount: UsdcAmount,
  nonce: UsdcAmount,
  deadline: UsdcAmount,
  chainId: z.number(),
  signature: z.string(),
});
const RequestState = z.object({
  kind: z.enum(["link", "approve"]).optional(),
  purchase: z.object({ vaultAddress: Address, proposalId: UsdcAmount }).nullable().optional(),
  status: z.enum([
    "pending",
    "processing",
    "awaiting_proof",
    "processing_proof",
    "verified",
    "cancelled",
    "failed",
    "expired",
  ]),
  errorCode: z.string().nullable().optional().default(null),
  attestation: Attestation.nullable(),
  humanApproval: HumanApprovalChallenge.nullable().optional().default(null),
});
export type Attestation = z.infer<typeof Attestation>;

function requestError(state: z.infer<typeof RequestState>) {
  const code =
    state.errorCode ??
    (state.status === "expired"
      ? "WORLD_EXPIRED"
      : state.status === "cancelled"
        ? "WORLD_CANCELLED"
        : "WORLD_VERIFICATION_FAILED");
  const messages: Record<string, string> = {
    WORLD_EXPIRED:
      "World did not return to Rickshare before this verification request expired. Close the World window and try again.",
    PROPOSAL_EXPIRED:
      "This proposal expired. Ask the planner for a new proposal, then approve again.",
    ATTESTATION_EXPIRED:
      "This approval expired. Start a fresh World verification, then approve again.",
    WORLD_CANCELLED: "World verification was cancelled. Close the World window and try again.",
    WORLD_EXCHANGE_FAILED:
      "Rickshare could not complete authentication with World. Close the World window and try again.",
    WORLD_TOKEN_INVALID:
      "World verification expired or did not match this request. Start a fresh verification.",
  };
  return new ApiError(
    code,
    messages[code] ??
      "World verification could not be completed. Close the World window and try again.",
    409,
  );
}

export const worldApi = {
  async status() {
    return (await readApi(await api.world.status.$get(), z.object({ linked: z.boolean() }))).linked;
  },
  async startLink() {
    return readApi(await api.world.link.start.$post(), Started);
  },
  async startApproval(tripId: string, proposalId: string) {
    return readApi(
      await api.trips[":tripId"].proposals[":proposalId"].approval.start.$post({
        param: { tripId, proposalId },
      }),
      Started,
    );
  },
  async request(requestId: string) {
    const state = await readApi(
      await api.world.requests[":requestId"].$get({ param: { requestId } }),
      RequestState,
    );
    if (["expired", "failed", "cancelled"].includes(state.status)) throw requestError(state);
    return state;
  },
  async cancel(requestId: string) {
    await api.world.requests[":requestId"].cancel.$post({ param: { requestId } });
  },
  async verifyApprovalProof(requestId: string, proof: unknown) {
    const response = await fetch(
      api.world.requests[":requestId"].proof.$url({ param: { requestId } }),
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      },
    );
    await readApi(response, z.object({ status: z.literal("verified") }));
    if (response.status !== 200)
      throw new ApiError("WORLD_VERIFICATION_FAILED", "World has not verified this share.", 409);
  },
};

const POLL_MS = 1500;
const GIVE_UP_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a World verification in a popup and resolves with its result. Call it straight from a
 * click: the popup opens before any network call so browsers do not block it. The API callback
 * returns the popup to the app, which closes it; this tab learns the result by polling.
 */
export async function verifyWithWorld(start: () => Promise<z.infer<typeof Started>>) {
  const popup = window.open("", "rickshare-world", "popup,width=480,height=720");
  if (!popup)
    throw new ApiError(
      "WORLD_POPUP_BLOCKED",
      "Your browser blocked World verification. Allow popups for Rickshare, then try again.",
      409,
    );
  try {
    const started = await start();
    popup.location.href = started.authorizationUrl;
    const deadline = Date.now() + GIVE_UP_MS;
    let closedAt: number | undefined;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const state = await worldApi.request(started.requestId);
      if (state.status === "verified") return state;
      if (state.status === "awaiting_proof") return { ...state, requestId: started.requestId };
      if (state.status !== "pending" && state.status !== "processing") throw requestError(state);
      // The callback may still be landing right after the popup closes, so allow a moment.
      if (popup.closed) {
        closedAt ??= Date.now();
        if (Date.now() - closedAt > 4000) break;
      }
    }
    await worldApi.cancel(started.requestId);
    throw new ApiError(
      closedAt === undefined ? "WORLD_TIMEOUT" : "WORLD_WINDOW_CLOSED",
      closedAt === undefined
        ? "World did not return to Rickshare in time. Close the World window and start a fresh verification."
        : "The World window closed before verification finished. Start a fresh verification.",
      409,
    );
  } finally {
    if (popup && !popup.closed) popup.close();
  }
}

/** In the popup the callback returns to, close it once the API has recorded the result. */
export function closeIfWorldPopup() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("world_request") && window.opener && window.name === "rickshare-world")
    window.close();
}
