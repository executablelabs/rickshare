import { MerchantCatalog, MerchantQuoteRequest, SignedQuote } from "@kitty/shared";
import { z } from "zod";
import { AppError } from "../../lib/errors";

export class MerchantClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret?: string,
    private readonly fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  ) {}

  private url(path: string) {
    const url = new URL(this.baseUrl);
    if (!["http:", "https:"].includes(url.protocol))
      throw new AppError("MERCHANTS_NOT_CONFIGURED", "The merchant URL is invalid.", 503);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(this.url(path), {
        ...init,
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
    } catch {
      throw new AppError("MERCHANT_UNAVAILABLE", "The merchant could not be reached.", 503);
    }
    if (!response.ok)
      throw new AppError(
        "MERCHANT_REQUEST_FAILED",
        "The merchant could not complete this request.",
        503,
      );
    try {
      return await response.json();
    } catch {
      throw new AppError(
        "MERCHANT_RESPONSE_INVALID",
        "The merchant returned an invalid response.",
        503,
      );
    }
  }

  async catalog() {
    const parsed = MerchantCatalog.safeParse(await this.request("catalog"));
    if (!parsed.success)
      throw new AppError("MERCHANT_RESPONSE_INVALID", "The merchant catalog is invalid.", 503);
    return parsed.data;
  }

  async quote(input: z.infer<typeof MerchantQuoteRequest>) {
    const request = MerchantQuoteRequest.parse(input);
    const merchant = (await this.catalog()).find((entry) => entry.id === request.merchantId);
    if (!merchant?.address || !merchant.items.some((entry) => entry.id === request.itemId))
      throw new AppError("MERCHANT_NOT_CONFIGURED", "Choose a configured merchant activity.", 409);
    const result = SignedQuote.safeParse(
      await this.request("quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
    );
    if (!result.success)
      throw new AppError("MERCHANT_RESPONSE_INVALID", "The merchant quote is invalid.", 503);
    const quote = result.data;
    if (
      quote.merchant.toLowerCase() !== merchant.address.toLowerCase() ||
      quote.vaultAddress.toLowerCase() !== request.vaultAddress.toLowerCase() ||
      quote.itemId !== request.itemId ||
      quote.quantity !== request.quantity
    )
      throw new AppError(
        "MERCHANT_QUOTE_MISMATCH",
        "The quote does not match the selected merchant activity.",
        503,
      );
    return quote;
  }

  async ticket(vault: string, proposalId: string) {
    if (!this.secret)
      throw new AppError("MERCHANTS_NOT_CONFIGURED", "Ticket lookup is not configured.", 503);
    const result = z
      .object({
        payload: z.string().min(1).max(16384),
        ticketHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      })
      .safeParse(
        await this.request(
          `internal/tickets/${encodeURIComponent(vault)}/${encodeURIComponent(proposalId)}`,
          { headers: { Authorization: `Bearer ${this.secret}` } },
        ),
      );
    if (!result.success)
      throw new AppError("MERCHANT_RESPONSE_INVALID", "The merchant ticket is invalid.", 503);
    return result.data;
  }
}
