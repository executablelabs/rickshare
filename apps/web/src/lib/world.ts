import { Address, UsdcAmount } from "@rickshare/shared";
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
  status: z.enum(["pending", "processing", "verified", "cancelled", "failed", "expired"]),
  errorCode: z.string().nullable(),
  attestation: Attestation.nullable(),
});
export type Attestation = z.infer<typeof Attestation>;

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
    return readApi(
      await api.world.requests[":requestId"].$get({ param: { requestId } }),
      RequestState,
    );
  },
  async cancel(requestId: string) {
    await api.world.requests[":requestId"].cancel.$post({ param: { requestId } });
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
      if (state.status !== "pending" && state.status !== "processing")
        throw new Error(
          state.status === "cancelled"
            ? "World verification was cancelled. Nothing changed."
            : "World verification did not finish. Try again.",
        );
      // The callback may still be landing right after the popup closes, so allow a moment.
      if (popup.closed) {
        closedAt ??= Date.now();
        if (Date.now() - closedAt > 4000) break;
      }
    }
    await worldApi.cancel(started.requestId);
    throw new Error("World verification was closed before it finished. Nothing changed.");
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
