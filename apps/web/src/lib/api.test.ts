import { expect, test, vi } from "vitest";

vi.mock("../config", () => ({ config: { VITE_API_URL: "/api" } }));

import { api } from "./api";

test("same-origin auth and stream URL generation retains the deployed API prefix", () => {
  const nonce = api.auth.nonce.$url();
  expect(nonce.origin).toBe(window.location.origin);
  expect(nonce.pathname).toBe("/api/auth/nonce");
  const stream = api.trips[":tripId"].stream.$url({ param: { tripId: "demo-vault" } });
  expect(stream.origin).toBe(window.location.origin);
  expect(stream.pathname).toBe("/api/trips/demo-vault/stream");
});
