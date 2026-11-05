import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
