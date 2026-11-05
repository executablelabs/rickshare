import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { AppError } from "../../lib/errors";
import { NONCE_COOKIE, requireOrigin, requireSession, SESSION_COOKIE } from "./middleware";
import { LoginInput } from "./schemas";
import type { AuthEnv, AuthService } from "./service";

export function createAuthRoutes(service: () => AuthService) {
  return new Hono<AuthEnv>()
    .use("*", async (context, next) => {
      context.header("Cache-Control", "no-store");
      await next();
    })
    .get("/nonce", (context) => {
      const auth = service();
      const { nonce, browserToken } = auth.issueNonce();
      setCookie(context, NONCE_COOKIE, browserToken, {
        httpOnly: true,
        secure: auth.secureCookie,
        sameSite: "Lax",
        path: "/auth",
        maxAge: auth.nonceTtlSeconds,
      });
      return context.json({ nonce });
    })
    .post(
      "/verify",
      requireOrigin(service),
      zValidator("json", LoginInput, (result) => {
        if (!result.success)
          throw new AppError(
            "INVALID_INPUT",
            "A sign-in message and wallet signature are required.",
            400,
          );
      }),
      async (context) => {
        const auth = service();
        const input = context.req.valid("json");
        const result = await auth.verify(
          input.message,
          input.signature,
          getCookie(context, NONCE_COOKIE),
        );
        auth.logout(getCookie(context, SESSION_COOKIE));
        deleteCookie(context, NONCE_COOKIE, { path: "/auth" });
        setCookie(context, SESSION_COOKIE, result.token, {
          httpOnly: true,
          secure: auth.secureCookie,
          sameSite: "Lax",
          path: "/",
          maxAge: auth.sessionTtlSeconds,
        });
        return context.json(result.session);
      },
    )
    .get("/session", requireSession(service), (context) => context.json(context.get("session")))
    .post("/logout", requireOrigin(service), (context) => {
      service().logout(getCookie(context, SESSION_COOKIE));
      deleteCookie(context, SESSION_COOKIE, { path: "/" });
      return context.json({ success: true } as const);
    });
}
