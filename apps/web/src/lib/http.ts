import type { z } from "zod";

/** A typed API failure. The message is the API's own user-facing text. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type JsonResponse = Pick<Response, "ok" | "status" | "json">;

function errorBody(body: unknown): { code: string; message: string } | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string" ? { code, message } : null;
}

/** Reads an API response, validating success bodies and turning error bodies into ApiError. */
export async function readApi<T>(response: JsonResponse, schema: z.ZodType<T>): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or non-JSON body falls through to the generic error below.
  }
  if (!response.ok) {
    const error = errorBody(body);
    throw new ApiError(
      error?.code ?? "UNAVAILABLE",
      error?.message ?? "Something went wrong. Try again.",
      response.status,
    );
  }
  return schema.parse(body);
}

/** One sentence to show a member, whatever failed: the API, the wallet or the network. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if (/insufficient funds|exceeds balance/i.test(error.message))
      return "Your account needs a little USDC on Arc for network fees. Get test USDC from the Circle faucet, then try again.";
    if (/user rejected|denied|cancel/i.test(error.message))
      return "You cancelled in your wallet. Nothing changed.";
    if (error.message.length <= 160) return error.message;
  }
  return "Something went wrong. Try again.";
}
