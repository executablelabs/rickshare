import { createHash, timingSafeEqual } from "node:crypto";
import { Address } from "@rickshare/shared";
import { Hono } from "hono";
import { html } from "hono/html";
import QRCode from "qrcode";
import { z } from "zod";
import { config } from "./config";
import { handleError, MerchantError } from "./errors";
import { createMerchantRuntime } from "./runtime";
import { QuoteInput } from "./schemas";
import type { MerchantService } from "./service";
import { createX402Routes } from "./x402";

export function createApp(options: { service?: MerchantService; apiSecret?: string } = {}) {
  const runtime = createMerchantRuntime();
  const service = () => options.service ?? runtime.service();
  return new Hono()
    .onError(handleError)
    .route("/", createX402Routes(service))
    .get("/health", (context) => context.json({ status: "ok" } as const))
    .get("/catalog", (context) => context.json(service().catalog()))
    .post("/quotes", async (context) => {
      let body: unknown;
      try {
        body = await context.req.json<unknown>();
      } catch {
        throw new MerchantError("INVALID_REQUEST", "The quote request must be JSON.");
      }
      const parsed = QuoteInput.safeParse(body);
      if (!parsed.success)
        throw new MerchantError(
          "INVALID_QUOTE_INPUT",
          "Choose a merchant, activity, trip, quantity and time.",
        );
      return context.json(await service().quote(parsed.data));
    })
    .get("/internal/tickets/:vault/:proposalId", (context) => {
      const secret = options.apiSecret ?? config.MERCHANTS_API_SECRET;
      if (!secret)
        throw new MerchantError(
          "MERCHANT_NOT_CONFIGURED",
          "Internal ticket lookup is not configured.",
          503,
        );
      const supplied = context.req.header("Authorization") ?? "";
      const digest = (value: string) => createHash("sha256").update(value).digest();
      if (!timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
        throw new MerchantError("UNAUTHORIZED", "Service authentication is required.", 401);
      const parsed = z
        .object({
          vault: Address,
          proposalId: z
            .string()
            .regex(/^[1-9]\d*$/)
            .max(78),
        })
        .safeParse(context.req.param());
      if (!parsed.success)
        throw new MerchantError("INVALID_PURCHASE", "A valid trip and proposal are required.");
      context.header("Cache-Control", "no-store");
      return context.json(service().ticketFor(parsed.data.vault, parsed.data.proposalId));
    })
    .get("/tickets/:id", async (context) => {
      const id = z
        .string()
        .regex(/^[a-zA-Z0-9_-]{43}$/)
        .safeParse(context.req.param("id"));
      if (!id.success)
        throw new MerchantError("TICKET_NOT_FOUND", "This ticket is not available.", 404);
      const bundle = service().ticket(id.data);
      const qr = await QRCode.toDataURL(bundle.ticket.url, { width: 240, margin: 2 });
      context.header("Cache-Control", "no-store");
      context.header("Referrer-Policy", "no-referrer");
      context.header(
        "Content-Security-Policy",
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      );
      return context.html(
        html`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ticket ready</title><style>:root{--paper:#f3f5f7;--ink:#16213e}body{background:var(--paper);color:var(--ink);font-family:system-ui,sans-serif;margin:0;padding:20px}main{max-width:560px}img{max-width:100%;height:auto}dt{font-weight:600}dd{margin:0 0 16px}code{overflow-wrap:anywhere}</style></head><body><main><h1>${bundle.title}</h1><dl><dt>Merchant</dt><dd>${bundle.merchantName}</dd><dt>Location</dt><dd>${bundle.location}</dd><dt>Starts</dt><dd>${bundle.startsAt}</dd><dt>Tickets</dt><dd>${bundle.quantity}</dd><dt>Booking code</dt><dd><code>${bundle.ticket.code}</code></dd></dl><img src="${qr}" alt="Ticket QR code" width="240" height="240"><p>Keep this ticket link for entry.</p></main></body></html>`,
      );
    });
}

export const app = createApp();
