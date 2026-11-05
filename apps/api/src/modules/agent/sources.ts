import { AppError } from "../../lib/errors";
import {
  type CatalogMerchant,
  MerchantCatalogResponse,
  type SearchResult,
  TavilySearchResponse,
} from "./schemas";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 15_000;

export function createTavilySearch(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async function searchActivities(query: string): Promise<SearchResult[]> {
    const response = await fetchImpl(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new AppError("SEARCH_FAILED", "Activity search failed.", 502);
    const { results } = TavilySearchResponse.parse(await response.json());
    return results.map(({ title, url, content }) => ({ title, url, content }));
  };
}

export function createMerchantCatalog(merchantsUrl: string, fetchImpl: typeof fetch = fetch) {
  return async function listMerchants(): Promise<CatalogMerchant[]> {
    const response = await fetchImpl(new URL("/catalog", merchantsUrl), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new AppError("MERCHANTS_UNAVAILABLE", "The merchant list is unavailable.", 502);
    }
    return MerchantCatalogResponse.parse(await response.json());
  };
}
