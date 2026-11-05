import { expect, test } from "bun:test";
import { MerchantClient } from "./merchants";

test("merchant clients preserve a configured URL path prefix and never expose the internal secret in URLs", async () => {
  const urls: string[] = [];
  const client = new MerchantClient(
    "https://merchant.example/bookings/",
    "private-service-secret",
    async (url, init) => {
      urls.push(url);
      if (url.endsWith("/catalog")) return Response.json([]);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-service-secret");
      return Response.json({ payload: "{}", ticketHash: `0x${"00".repeat(32)}` });
    },
  );
  expect(await client.catalog()).toEqual([]);
  await client.ticket("0x0000000000000000000000000000000000000123", "1");
  expect(urls[0]).toBe("https://merchant.example/bookings/catalog");
  expect(urls[1]).toContain("/bookings/internal/tickets/");
  expect(urls.join(" ")).not.toContain("private-service-secret");
});
