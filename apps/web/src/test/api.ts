import { vi } from "vitest";

type Handler = (body: unknown) => { status?: number; body: unknown };

/**
 * Stubs fetch for API calls by "METHOD /path" (query strings ignored), so tests exercise the real
 * typed client. Unknown routes fail the test loudly instead of hanging.
 */
export function stubApi(routes: Record<string, Handler>) {
  const calls: Array<{ route: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const text = request.method === "GET" ? "" : await request.clone().text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    calls.push({ route, body });
    const handler = routes[route];
    if (!handler) throw new Error(`Unstubbed API call: ${route}`);
    const result = handler(body);
    return Response.json(result.body, { status: result.status ?? 200 });
  });
  return calls;
}
