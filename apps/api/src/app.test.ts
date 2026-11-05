import { expect, test } from "bun:test";
import { app } from "./app";

test("health is available without external services or credentials", async () => {
  const response = await app.request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
