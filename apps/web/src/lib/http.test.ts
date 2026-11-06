import { expect, test } from "vitest";
import { z } from "zod";
import { ApiError, messageOf, readApi } from "./http";

test("returns a validated success body", async () => {
  expect(await readApi(Response.json({ id: "1" }), z.object({ id: z.string() }))).toEqual({
    id: "1",
  });
});

test("surfaces the API's own error code and message", async () => {
  const failure = readApi(
    Response.json(
      { error: { code: "TRIP_FULL", message: "This trip already has 32 members." } },
      { status: 409 },
    ),
    z.unknown(),
  );
  await expect(failure).rejects.toMatchObject({
    code: "TRIP_FULL",
    status: 409,
    message: "This trip already has 32 members.",
  });
});

test("falls back to a generic error for an unreadable body", async () => {
  await expect(readApi(new Response("oops", { status: 502 }), z.unknown())).rejects.toBeInstanceOf(
    ApiError,
  );
});

test.each([
  [new Error("insufficient funds for gas * price + value"), /Circle faucet/],
  [new Error("User rejected the request."), /You cancelled in your wallet/],
  [new ApiError("X", "Ask for a new invitation.", 409), /Ask for a new invitation/],
  ["not an error", /Something went wrong/],
])("explains %s in one sentence", (error, expected) => {
  expect(messageOf(error)).toMatch(expected);
});
