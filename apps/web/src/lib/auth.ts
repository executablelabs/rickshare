import { arcTestnet } from "@rickshare/shared";
import { getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";
import { api } from "./api";

const Session = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .transform((address) => getAddress(address)),
  expiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof Session>;

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function readResponse(response: Pick<Response, "ok" | "status" | "json">): Promise<unknown> {
  if (!response.ok) {
    throw new AuthError(
      response.status === 401 ? "UNAUTHENTICATED" : "AUTH_UNAVAILABLE",
      response.status === 401
        ? "Your sign-in expired. Continue to sign in again."
        : "Sign-in is unavailable. Please try again.",
    );
  }
  return response.json();
}

export const authApi = {
  async session(signal: AbortSignal) {
    const response = await api.auth.session.$get({}, { init: { signal } });
    if (response.status === 401) return null;
    return Session.parse(await readResponse(response));
  },
  async nonce() {
    const response = await api.auth.nonce.$get();
    return z
      .object({ nonce: z.string().regex(/^[a-zA-Z0-9]{8,}$/) })
      .parse(await readResponse(response)).nonce;
  },
  async verify(message: string, signature: `0x${string}`) {
    return Session.parse(
      await readResponse(
        await api.auth.verify.$post({
          json: { message, signature },
        }),
      ),
    );
  },
  async logout() {
    z.object({ success: z.literal(true) }).parse(await readResponse(await api.auth.logout.$post()));
  },
};

export function signInMessage(address: `0x${string}`, nonce: string, origin: string) {
  const url = new URL(origin);
  return createSiweMessage({
    address,
    chainId: arcTestnet.id,
    domain: url.host,
    uri: url.origin,
    version: "1",
    nonce,
    statement: "Sign in to Rickshare. This does not approve spending.",
    issuedAt: new Date(),
  });
}
