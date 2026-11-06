import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isRpcRateLimit } from "./rpc";

export class MerchantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ContentfulStatusCode = 400,
  ) {
    super(message);
  }
}

export const handleError: ErrorHandler = (error, context) => {
  if (isRpcRateLimit(error)) {
    context.header("Retry-After", "60");
    return context.json(
      {
        error: {
          code: "RPC_RATE_LIMITED",
          message:
            "The merchant chain connection is temporarily rate limited. Please retry shortly.",
        },
      },
      503,
    );
  }
  if (error instanceof MerchantError)
    return context.json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof HTTPException && error.status < 500)
    return context.json(
      { error: { code: "INVALID_REQUEST", message: "The request is invalid." } },
      error.status,
    );
  process.stderr.write(`${JSON.stringify({ level: "error", code: "MERCHANT_INTERNAL_ERROR" })}\n`);
  return context.json(
    {
      error: {
        code: "MERCHANT_INTERNAL_ERROR",
        message: "The merchant service is temporarily unavailable.",
      },
    },
    500,
  );
};
