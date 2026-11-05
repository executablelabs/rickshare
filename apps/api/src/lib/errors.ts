import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ContentfulStatusCode = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const handleError: ErrorHandler = (error, context) => {
  if (error instanceof HTTPException && error.status < 500) {
    return context.json(
      { error: { code: "INVALID_REQUEST", message: "The request is invalid." } },
      error.status,
    );
  }
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error(error.code);
    return context.json({ error: { code: error.code, message: error.message } }, error.status);
  }

  logger.error("INTERNAL_ERROR");
  return context.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." } },
    500,
  );
};
