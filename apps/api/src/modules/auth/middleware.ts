import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppError } from "../../lib/errors";
import type { AuthEnv, AuthService } from "./service";

export const SESSION_COOKIE = "rickshare_session";
export const NONCE_COOKIE = "rickshare_nonce";

export function requireSession(service: () => AuthService) {
  return createMiddleware<AuthEnv>(async (context, next) => {
    context.set("session", service().requireSession(getCookie(context, SESSION_COOKIE)));
    await next();
  });
}

export function requireOrigin(service: () => AuthService) {
  return createMiddleware<AuthEnv>(async (context, next) => {
    if (context.req.header("Origin") !== service().origin)
      throw new AppError("INVALID_ORIGIN", "This request came from a different application.", 403);
    await next();
  });
}
