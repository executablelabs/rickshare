import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createWebHandler } from "../../../../scripts/serve-web";
import { createApp } from "../app";
import { createDatabase } from "../db/client";
import { AuthService } from "../modules/auth/service";
import { createRuntime } from "../runtime";

const servers: Bun.Server<undefined>[] = [];
const directories: string[] = [];
const close: Array<() => void> = [];
afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const cleanup of close.splice(0)) cleanup();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(fetcher: (request: Request) => Response | Promise<Response>) {
  const directory = await mkdtemp(join(tmpdir(), "rickshare-web-proxy-"));
  directories.push(directory);
  await Bun.write(join(directory, "index.html"), "<!doctype html><h1>Rickshare</h1>");
  const upstream = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: fetcher });
  const web = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: createWebHandler({
      apiUpstream: `http://127.0.0.1:${upstream.port}`,
      distDirectory: directory,
    }),
  });
  servers.push(upstream, web);
  return { origin: `http://127.0.0.1:${web.port}`, directory, upstream };
}

test("same-origin proxy preserves secure cookies through real SIWE login and logout", async () => {
  const db = createDatabase(":memory:");
  const auth = new AuthService(db, {
    origin: "https://rickshare.xyz",
    secret: "deployment-test-secret-at-least-32-characters",
    nonceTtlSeconds: 300,
    sessionTtlSeconds: 3600,
    verifySignature: verifyMessage,
  });
  const runtime = createRuntime({ db, auth });
  close.push(() => runtime.close());
  const app = createApp({ runtime });
  const { origin } = await fixture((request) => app.fetch(request));
  const challenge = await fetch(`${origin}/api/auth/nonce`);
  const { nonce } = await challenge.json();
  const nonceHeader = challenge.headers.getSetCookie()[0];
  expect(nonceHeader).toContain("Path=/api/auth");
  expect(nonceHeader).toContain("HttpOnly");
  expect(nonceHeader).toContain("Secure");
  expect(nonceHeader).toContain("SameSite=Lax");
  const account = privateKeyToAccount(`0x${"81".repeat(32)}`);
  const message = createSiweMessage({
    address: account.address,
    chainId: 5042002,
    domain: "rickshare.xyz",
    uri: "https://rickshare.xyz",
    version: "1",
    nonce,
    issuedAt: new Date(),
  });
  const signedIn = await fetch(`${origin}/api/auth/verify`, {
    method: "POST",
    headers: {
      Origin: "https://rickshare.xyz",
      Cookie: nonceHeader?.split(";")[0] ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, signature: await account.signMessage({ message }) }),
  });
  expect(signedIn.status).toBe(200);
  const cookieHeaders = signedIn.headers.getSetCookie();
  expect(cookieHeaders).toHaveLength(2);
  expect(cookieHeaders.some((cookie) => cookie.includes("Path=/api/auth"))).toBe(true);
  const sessionHeader = cookieHeaders.find((cookie) => cookie.startsWith("rickshare_session="));
  expect(sessionHeader).toContain("Path=/;");
  const cookie = sessionHeader?.split(";")[0] ?? "";
  const session = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie } });
  expect(session.status).toBe(200);
  expect((await session.json()).address).toBe(account.address);
  const logout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "https://rickshare.xyz",
      Cookie: cookie,
    },
  });
  expect(logout.status).toBe(200);
  expect((await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie } })).status).toBe(
    401,
  );
});

test("proxy streams SSE and preserves redirects and the original request origin", async () => {
  const seen: Array<{ path: string; origin: string | null; body: string }> = [];
  const { origin } = await fixture(async (request) => {
    const path = new URL(request.url).pathname;
    seen.push({ path, origin: request.headers.get("origin"), body: await request.text() });
    if (path === "/world/callback")
      return Response.redirect("https://rickshare.xyz/?world_status=complete", 302);
    if (path === "/stream")
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("id: 7\ndata: ready\n\n"));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } },
      );
    return Response.json({ accepted: true });
  });
  const stream = await fetch(`${origin}/api/stream`);
  expect(stream.headers.get("content-type")).toBe("text/event-stream");
  expect(await stream.text()).toBe("id: 7\ndata: ready\n\n");
  const redirect = await fetch(`${origin}/api/world/callback`, { redirect: "manual" });
  expect(redirect.status).toBe(302);
  expect(redirect.headers.get("location")).toBe("https://rickshare.xyz/?world_status=complete");
  await fetch(`${origin}/api//untrusted.example/action`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
    body: "payload",
  });
  expect(seen.at(-1)).toEqual({
    path: "/untrusted.example/action",
    origin: "https://untrusted.example",
    body: "payload",
  });
});

test("serves SPA deep links without exposing dotfiles or files outside the web build", async () => {
  const { origin, directory } = await fixture(() => new Response("unused"));
  await Bun.write(join(directory, "asset.js"), "export default 1;");
  expect(await (await fetch(`${origin}/trips/demo/plan`)).text()).toContain("<h1>Rickshare</h1>");
  expect((await fetch(`${origin}/asset.js`)).headers.get("content-type")).toContain("javascript");
  expect((await fetch(`${origin}/.env`)).status).toBe(404);
  expect((await fetch(`${origin}/%2f..%2fpackage.json`)).status).toBe(404);
  expect((await fetch(`${origin}/missing.js`)).status).toBe(404);
  expect((await fetch(`${origin}/health`)).status).toBe(200);
});

test("an unavailable upstream produces a typed uncached error without internal details", async () => {
  const { origin, upstream } = await fixture(() => new Response("unused"));
  upstream.stop(true);
  const response = await fetch(`${origin}/api/auth/session`);
  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    error: {
      code: "API_UNAVAILABLE",
      message: "The service is unavailable. Try again shortly.",
    },
  });
});
