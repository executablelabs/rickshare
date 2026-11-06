import { afterEach, expect, test, vi } from "vitest";
import { authApi } from "./auth";

afterEach(() => vi.unstubAllGlobals());

test("auth requests include browser credentials without exposing session cookies", async () => {
  const fetcher = vi.fn(async () => Response.json({ nonce: "abcdefgh12345678" }));
  vi.stubGlobal("fetch", fetcher);
  expect(await authApi.nonce()).toBe("abcdefgh12345678");
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringMatching(/\/auth\/nonce$/),
    expect.objectContaining({ credentials: "include" }),
  );
});

test("only an unauthenticated session response is treated as signed out", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await authApi.session(new AbortController().signal)).toBeNull();
  fetcher.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(authApi.session(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTH_UNAVAILABLE",
  });
});

test("malformed session and nonce responses fail validation", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ address: "not-an-account", expiresAt: "tomorrow" }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(authApi.session(new AbortController().signal)).rejects.toThrow();
  fetcher.mockResolvedValue(Response.json({ nonce: "short" }));
  await expect(authApi.nonce()).rejects.toThrow();
});
