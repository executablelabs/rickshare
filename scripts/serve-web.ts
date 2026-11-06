import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { logger } from "../apps/api/src/lib/logger";

type WebOptions = { apiUpstream: string; distDirectory: string };

export function createWebHandler({ apiUpstream, distDirectory }: WebOptions) {
  const root = resolve(distDirectory);
  const upstream = new URL(apiUpstream);
  if (!["http:", "https:"].includes(upstream.protocol) || upstream.username || upstream.password)
    throw new Error("INVALID_API_UPSTREAM");

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ok" });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const target = new URL(upstream);
      // Assign pathname separately: a path beginning // must never select a different host.
      target.pathname = url.pathname.slice(4) || "/";
      target.search = url.search;
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("accept-encoding");
      let response: Response;
      try {
        response = await fetch(
          new Request(target, {
            method: request.method,
            headers,
            ...(request.method !== "GET" && request.method !== "HEAD"
              ? { body: request.body }
              : {}),
            signal: request.signal,
            redirect: "manual",
          }),
        );
      } catch {
        logger.error("WEB_API_UNAVAILABLE");
        return Response.json(
          {
            error: {
              code: "API_UNAVAILABLE",
              message: "The service is unavailable. Try again shortly.",
            },
          },
          { status: 502, headers: { "cache-control": "no-store" } },
        );
      }
      const outgoing = new Headers(response.headers);
      for (const header of ["connection", "keep-alive", "transfer-encoding", "content-length"])
        outgoing.delete(header);
      outgoing.delete("set-cookie");
      for (const cookie of response.headers.getSetCookie()) {
        outgoing.append(
          "set-cookie",
          cookie.replace(/(;\s*Path=)([^;]*)/i, (match, prefix: string, path: string) =>
            path === "/" ? match : `${prefix}/api${path.startsWith("/") ? path : `/${path}`}`,
          ),
        );
      }
      return new Response(response.body, { status: response.status, headers: outgoing });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    const path = resolve(root, `.${pathname}`);
    const withinRoot = relative(root, path);
    if (
      withinRoot.startsWith("..") ||
      isAbsolute(withinRoot) ||
      pathname.split("/").some((part) => part.startsWith("."))
    )
      return new Response("Not found", { status: 404 });
    const asset = Bun.file(path);
    if (pathname !== "/" && (await asset.exists()))
      return new Response(request.method === "HEAD" ? null : asset, {
        headers: {
          "content-type": asset.type,
          "cache-control": pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        },
      });
    if (pathname.includes(".") && !request.headers.get("accept")?.includes("text/html"))
      return new Response("Not found", { status: 404 });
    const index = Bun.file(resolve(root, "index.html"));
    if (!(await index.exists())) return new Response("Web build is unavailable", { status: 503 });
    return new Response(request.method === "HEAD" ? null : index, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  };
}

export function startWebServer() {
  const blank = (value: unknown) => (value === "" ? undefined : value);
  const config = z
    .object({
      PORT: z.preprocess(blank, z.coerce.number().int().min(1).max(65535).default(8080)),
      API_UPSTREAM_URL: z.preprocess(blank, z.url().default("http://localhost:8787")),
    })
    .parse(process.env);
  return Bun.serve({
    hostname: "::",
    port: config.PORT,
    idleTimeout: 60,
    fetch: createWebHandler({
      apiUpstream: config.API_UPSTREAM_URL,
      distDirectory: fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
    }),
  });
}

if (import.meta.main) startWebServer();
