import { Trip } from "@rickshare/shared";
import { vi } from "vitest";

type Handler = (body: unknown, request: Request) => { status?: number; body: unknown };

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
    const result = handler(body, request);
    return Response.json(result.body, { status: result.status ?? 200 });
  });
  return calls;
}

const memberFixture = (address: string, displayName: string) => ({
  address,
  displayName,
  ensName: null,
  worldLinked: false,
  policy: { autoApproveMax: "0", totalCap: "0" },
  deposited: "0",
  spent: "0",
  locked: "0",
  available: "0",
});

/** A trip with the signed-in member in it, as GET /trips/:tripId returns it. */
export function tripFixture(tripId: string, me: string, overrides: Record<string, unknown> = {}) {
  return {
    id: tripId,
    name: "India 26",
    ensName: null,
    vaultAddress: `0x${"3".repeat(40)}`,
    endsAt: "2099-12-18T23:59:00.000Z",
    members: [memberFixture(me, "Angie"), memberFixture(`0x${"2".repeat(40)}`, "Bashy")],
    ...overrides,
  };
}

/** The reads every trip page makes, for a member who did not create the trip. */
export function tripRoutes(tripId: string, me: string, trip: unknown = tripFixture(tripId, me)) {
  const snapshot = Trip.parse(trip);
  const member = snapshot.members.find(
    (member) => member.address.toLowerCase() === me.toLowerCase(),
  );
  if (!member) throw new Error("The trip fixture must include the signed-in member.");
  return {
    [`GET /trips/${tripId}`]: () => ({ body: trip }),
    [`GET /trips/${tripId}/invites`]: () => ({
      status: 403,
      body: {
        error: { code: "NOT_CREATOR", message: "Only the trip creator can manage invitations." },
      },
    }),
    [`GET /trips/${tripId}/chat`]: () => ({ body: { messages: [] } }),
    [`GET /trips/${tripId}/proposals`]: () => ({ body: { proposals: [] } }),
    [`GET /trips/${tripId}/money`]: () => ({
      body: {
        members: snapshot.members,
        indexedBlock: "100",
        own: {
          deposited: member.deposited,
          spent: member.spent,
          locked: member.locked,
          available: member.available,
          withdrawn: "0",
        },
        walletBalance: "75000000",
        settled: false,
      },
    }),
  };
}
