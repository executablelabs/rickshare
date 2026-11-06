import { randomBytes } from "node:crypto";
import { X402Booking } from "@rickshare/shared";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import { getDefaultAsset } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HonoAdapter } from "@x402/hono";
import { Hono } from "hono";
import { html } from "hono/html";
import QRCode from "qrcode";
import { keccak256, stringToHex } from "viem";
import { z } from "zod";
import { config } from "./config";
import { MerchantError } from "./errors";
import type { MerchantService } from "./service";

const quoteHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export function createX402Routes(service: () => MerchantService) {
  const server = new x402ResourceServer(
    new HTTPFacilitatorClient({
      url: config.X402_FACILITATOR_URL,
      timeoutMs: 15_000,
    }),
  ).register(config.X402_NETWORK, new ExactEvmScheme());
  let initialization: Promise<void> | undefined;
  const processing = new Set<string>();

  return new Hono()
    .post("/x402/bookings/:quoteHash", async (context) => {
      if (!config.X402_ENABLED)
        throw new MerchantError("X402_NOT_CONFIGURED", "x402 bookings are not enabled.", 503);
      const parsed = quoteHash.safeParse(context.req.param("quoteHash"));
      if (!parsed.success)
        throw new MerchantError("INVALID_QUOTE", "A valid quote hash is required.");
      const hash = parsed.data.toLowerCase();
      const signature = context.req.header("PAYMENT-SIGNATURE");
      if (signature && signature.length > 32768)
        throw new MerchantError("INVALID_PAYMENT", "The payment header is too large.");
      const paymentKey = signature ? keccak256(stringToHex(signature)) : undefined;
      const store = service().store;
      const existing = store.x402Booking(hash);
      context.header("Cache-Control", "no-store");
      if (existing && !paymentKey)
        throw new MerchantError(
          "BOOKING_PAYMENT_PENDING",
          "This quote already has a payment attempt. Reuse its original payment header.",
          409,
        );
      if (existing && paymentKey) {
        if (existing.payment_key !== paymentKey)
          throw new MerchantError(
            "BOOKING_PAYMENT_PENDING",
            "This quote already has a payment attempt. Reuse its original payment header.",
            409,
          );
        if (existing.settlement) {
          context.header("PAYMENT-RESPONSE", existing.settlement);
          return context.json(X402Booking.parse(JSON.parse(existing.payload)));
        }
      }
      if (processing.has(hash))
        throw new MerchantError("BOOKING_IN_PROGRESS", "This booking is being processed.", 409);
      processing.add(hash);
      try {
        const quote = await service().bookingQuote(hash);
        initialization ??= server.initialize().catch((error: unknown) => {
          initialization = undefined;
          throw error;
        });
        await initialization;
        if (!server.getSupportedKind(2, config.X402_NETWORK, "exact"))
          throw new MerchantError(
            "X402_NETWORK_UNSUPPORTED",
            "The facilitator does not support this payment network.",
            503,
          );
        const asset = getDefaultAsset(config.X402_NETWORK, "USDC");
        const resource = new URL(config.PUBLIC_URL);
        resource.pathname = `${resource.pathname.replace(/\/$/, "")}/x402/bookings/${hash}`;
        resource.search = "";
        resource.hash = "";
        const httpServer = new x402HTTPResourceServer(server, {
          [`POST /x402/bookings/${hash}`]: {
            accepts: [
              {
                scheme: "exact",
                network: config.X402_NETWORK,
                payTo: quote.merchant,
                price: {
                  amount: quote.total,
                  asset: asset.asset,
                  extra: { name: asset.name, version: asset.version },
                },
                maxTimeoutSeconds: 60,
              },
            ],
            resource: resource.toString(),
            description: `Book ${quote.quantity} ticket(s): ${quote.title}`,
            mimeType: "application/json",
          },
        });
        const request = {
          adapter: new HonoAdapter(context),
          path: context.req.path,
          method: "POST",
          ...(signature ? { paymentHeader: signature } : {}),
        };
        const result = await httpServer.processHTTPRequest(request);
        if (result.type === "payment-error") {
          return new Response(JSON.stringify(result.response.body ?? {}), {
            status: result.response.status,
            headers: {
              ...result.response.headers,
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
        if (result.type !== "payment-verified" || !paymentKey)
          throw new MerchantError("PAYMENT_REQUIRED", "A verified x402 payment is required.", 402);

        // Persist before settlement, but publish only after it succeeds. Unknown outcomes
        // retain the original payment key so a new authorization cannot charge again.
        let record = store.x402Booking(hash);
        if (!record) {
          const id = randomBytes(32).toString("base64url");
          const url = new URL(config.PUBLIC_URL);
          url.pathname = `${url.pathname.replace(/\/$/, "")}/x402/tickets/${id}`;
          url.search = "";
          url.hash = "";
          const booking = X402Booking.parse({
            id,
            code: randomBytes(12).toString("base64url"),
            url: url.toString(),
            quoteId: quote.quoteId,
            quoteHash: hash,
            vaultAddress: quote.vaultAddress,
            merchant: quote.merchant,
            title: quote.title,
            location: quote.location,
            startsAt: quote.startsAt,
            quantity: quote.quantity,
          });
          store.prepareX402({
            quote_hash: hash,
            id,
            payment_key: paymentKey,
            payload: JSON.stringify(booking),
          });
          record = store.x402Booking(hash);
        }
        if (!record || record.payment_key !== paymentKey)
          throw new MerchantError(
            "BOOKING_PAYMENT_PENDING",
            "This quote already has a payment attempt.",
            409,
          );
        const settlement = await httpServer.processSettlement(
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          { request },
          undefined,
          result.beforeHandlerSettlement,
        );
        if (!settlement.success) {
          return new Response(JSON.stringify(settlement.response.body ?? {}), {
            status: settlement.response.status,
            headers: {
              ...settlement.response.headers,
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
        const receipt = settlement.headers["PAYMENT-RESPONSE"];
        if (!receipt)
          throw new MerchantError(
            "SETTLEMENT_UNCONFIRMED",
            "Payment needs reconciliation. Keep the original payment header.",
            503,
          );
        store.settleX402(hash, receipt);
        context.header("PAYMENT-RESPONSE", receipt);
        return context.json(X402Booking.parse(JSON.parse(record.payload)));
      } catch (error) {
        if (error instanceof MerchantError) throw error;
        throw new MerchantError(
          "X402_UNAVAILABLE",
          "Payment could not be confirmed. Reuse the original payment header if one was sent.",
          503,
        );
      } finally {
        processing.delete(hash);
      }
    })
    .get("/x402/tickets/:id", async (context) => {
      const id = X402Booking.shape.id.safeParse(context.req.param("id"));
      const record = id.success ? service().store.x402Ticket(id.data) : null;
      if (!record)
        throw new MerchantError("TICKET_NOT_FOUND", "This ticket is not available.", 404);
      const ticket = X402Booking.parse(JSON.parse(record.payload));
      const qr = await QRCode.toDataURL(ticket.url, { width: 240, margin: 2 });
      context.header("Cache-Control", "no-store");
      context.header("Referrer-Policy", "no-referrer");
      context.header(
        "Content-Security-Policy",
        "default-src 'none'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
      );
      return context.html(
        html`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Booking ticket</title></head><body><main><h1>${ticket.title}</h1><p>${ticket.location}</p><p>${ticket.startsAt}</p><p>Tickets: ${ticket.quantity}</p><p>Booking code: <code>${ticket.code}</code></p><img src="${qr}" alt="Ticket QR code" width="240" height="240"></main></body></html>`,
      );
    });
}
