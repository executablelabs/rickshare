import { Address, IsoDate, type MerchantCatalog, UsdcAmount } from "@rickshare/shared";
import { z } from "zod";

// Tool inputs come from the model, so they are validated here even though the tool
// definitions are strict; extra fields (such as a payee) are rejected, not ignored.

export const SearchActivitiesInput = z.strictObject({ query: z.string().trim().min(1).max(200) });

export const NoInput = z.strictObject({});

export const GetQuoteInput = z.strictObject({
  merchantId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
});

export const ProposePurchaseInput = z.strictObject({
  quoteId: z.string().min(1),
  shares: z.array(z.strictObject({ member: Address, amount: UsdcAmount })).min(1),
});

export const UpdateItineraryInput = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1).nullable(),
        startsAt: IsoDate,
        title: z.string().trim().min(1).max(120),
        location: z.string().trim().min(1).max(120),
        proposalId: z.string().min(1).nullable(),
      }),
    )
    .max(100),
});

// External responses, validated at the boundary.

export const SearchResult = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
});

export const TavilySearchResponse = z.object({ results: z.array(SearchResult) });

export type SearchResult = z.infer<typeof SearchResult>;
export type CatalogMerchant = z.infer<typeof MerchantCatalog>[number];
