import { expect, test } from "bun:test";
import { AppError } from "../../lib/errors";
import { createMerchantCatalog, createTavilySearch } from "./sources";

function stubFetch(status: number, body: unknown, calls: Request[] = []): typeof fetch {
  const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status });
  };
  return Object.assign(stub, { preconnect: fetch.preconnect });
}

test("search sends the query with the key and keeps only title, url and content", async () => {
  const calls: Request[] = [];
  const search = createTavilySearch(
    "tvly-test",
    stubFetch(
      200,
      {
        query: "goa",
        results: [
          { title: "Arambol", url: "https://example.com/a", content: "Paragliding", score: 0.9 },
        ],
      },
      calls,
    ),
  );

  expect(await search("paragliding in goa")).toEqual([
    { title: "Arambol", url: "https://example.com/a", content: "Paragliding" },
  ]);
  const [request] = calls;
  expect(request?.headers.get("authorization")).toBe("Bearer tvly-test");
  expect(await request?.json()).toEqual({
    query: "paragliding in goa",
    max_results: 5,
    search_depth: "basic",
  });
});

test("search fails with a typed error on a bad status or a malformed body", async () => {
  await expect(createTavilySearch("k", stubFetch(429, {}))("goa")).rejects.toBeInstanceOf(AppError);
  await expect(
    createTavilySearch("k", stubFetch(200, { results: "nope" }))("goa"),
  ).rejects.toThrow();
});

test("catalog validates merchant prices as USDC base units", async () => {
  const merchant = {
    id: "goa-adventures",
    name: "Goa Adventures",
    items: [{ id: "p", title: "Paragliding", location: "Goa", unitPrice: "42000000" }],
  };
  const calls: Request[] = [];
  const catalog = createMerchantCatalog("http://merchants.test", stubFetch(200, [merchant], calls));

  expect(await catalog()).toEqual([merchant]);
  expect(calls[0]?.url).toBe("http://merchants.test/catalog");

  const badPrice = [{ ...merchant, items: [{ ...merchant.items[0], unitPrice: "42.00" }] }];
  await expect(
    createMerchantCatalog("http://m.test", stubFetch(200, badPrice))(),
  ).rejects.toThrow();
});
