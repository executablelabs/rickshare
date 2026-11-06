import { afterEach, expect, test, vi } from "vitest";
import { tripApi } from "./trips";

afterEach(() => vi.unstubAllGlobals());

test("validates trip response boundaries and preserves stable API error codes", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const trip = {
    id: "trip",
    name: "Goa",
    ensName: null,
    vaultAddress: "0x1111111111111111111111111111111111111111",
    endsAt: "2030-01-01T00:00:00.000Z",
    members: [],
  };
  fetch.mockResolvedValueOnce(Response.json(trip));
  expect(await tripApi.get("trip")).toEqual(trip);
  fetch.mockResolvedValueOnce(Response.json({ ...trip, ensName: 3 }));
  await expect(tripApi.get("trip")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  fetch.mockResolvedValueOnce(
    Response.json({ error: { code: "NOT_MEMBER", message: "Join this trip." } }, { status: 403 }),
  );
  await expect(tripApi.get("trip")).rejects.toMatchObject({
    code: "NOT_MEMBER",
    message: "Join this trip.",
  });
  fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(tripApi.get("trip")).rejects.toMatchObject({ code: "API_UNAVAILABLE" });
});
