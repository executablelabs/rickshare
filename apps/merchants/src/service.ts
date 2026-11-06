import { randomBytes, randomUUID } from "node:crypto";
import {
  type MerchantPayment,
  type QuoteTerms,
  quoteTypedData,
  SignedQuote,
  Ticket,
} from "@rickshare/shared";
import { getAddress, hashTypedData, keccak256, stringToHex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { z } from "zod";
import catalogData from "./catalog.json";
import type { MerchantChain } from "./chain";
import { MerchantError } from "./errors";
import { isRpcRateLimit } from "./rpc";
import { Catalog, QuoteInput, TicketBundle } from "./schemas";
import type { MerchantStore, TicketRecord } from "./store";

type Options = {
  publicUrl: string;
  accounts: Map<string, PrivateKeyAccount>;
  startBlock?: bigint;
  now?: () => number;
  payment?: z.infer<typeof MerchantPayment>;
  testUnitPriceCap?: bigint;
};

export class MerchantService {
  private readonly catalogData: z.infer<typeof Catalog>;
  private readonly now: () => number;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private retryAt = 0;
  private rateLimitFailures = 0;

  constructor(
    readonly store: MerchantStore,
    private readonly chain: MerchantChain | undefined,
    private readonly options: Options,
  ) {
    this.catalogData = Catalog.parse(catalogData).map((merchant) => ({
      ...merchant,
      items: merchant.items.map((item) => ({
        ...item,
        unitPrice:
          options.testUnitPriceCap !== undefined &&
          BigInt(item.unitPrice) > options.testUnitPriceCap
            ? options.testUnitPriceCap.toString()
            : item.unitPrice,
      })),
    }));
    this.now = options.now ?? Date.now;
    if (!["http:", "https:"].includes(new URL(options.publicUrl).protocol))
      throw new MerchantError(
        "INVALID_PUBLIC_URL",
        "The merchant public URL must use HTTP or HTTPS.",
        503,
      );
  }

  catalog() {
    return this.catalogData.map((merchant) => {
      const account = this.options.accounts.get(merchant.id);
      return {
        ...merchant,
        ...(account ? { address: account.address } : {}),
        ...(this.options.payment ? { payment: this.options.payment } : {}),
      };
    });
  }

  private requireChain() {
    if (!this.chain)
      throw new MerchantError(
        "MERCHANT_NOT_CONFIGURED",
        "The trip factory is not configured for this merchant.",
        503,
      );
    return this.chain;
  }

  async quote(input: unknown): Promise<SignedQuote> {
    const request = QuoteInput.parse(input);
    const merchant = this.catalogData.find((entry) => entry.id === request.merchantId);
    const item = merchant?.items.find((entry) => entry.id === request.itemId);
    if (!merchant || !item)
      throw new MerchantError("ITEM_NOT_FOUND", "This merchant does not offer that activity.", 404);
    const account = this.options.accounts.get(merchant.id);
    if (!account)
      throw new MerchantError(
        "MERCHANT_NOT_CONFIGURED",
        "This merchant's signing key is not configured.",
        503,
      );
    const chain = this.requireChain();
    const vaultAddress = getAddress(request.vaultAddress);
    const { endsAt } = await chain.validate(vaultAddress, account.address);
    const startsAt = BigInt(Math.floor(Date.parse(request.startsAt) / 1000));
    const now = Math.floor(this.now() / 1000);
    if (startsAt <= BigInt(now) || startsAt > endsAt)
      throw new MerchantError("INVALID_ACTIVITY_TIME", "The activity must start during the trip.");
    const expiry = Math.min(now + 300, Number(startsAt));
    const terms: QuoteTerms = {
      quoteId: randomUUID(),
      itemId: item.id,
      merchant: account.address,
      title: item.title,
      location: item.location,
      unitPrice: item.unitPrice,
      quantity: request.quantity,
      total: (BigInt(item.unitPrice) * BigInt(request.quantity)).toString(),
      startsAt: new Date(Number(startsAt) * 1000).toISOString(),
      expiresAt: new Date(expiry * 1000).toISOString(),
      vaultAddress,
      chainId: chain.chainId,
    };
    const data = quoteTypedData(terms);
    const signed = SignedQuote.parse({
      ...terms,
      quoteHash: hashTypedData(data),
      signature: await account.signTypedData(data),
    });
    this.store.saveQuote(signed, this.options.payment ? "x402" : "vault");
    return signed;
  }

  async bookingQuote(hash: string) {
    const quote = this.store.quote(hash);
    if (!quote || this.store.quoteProtocol(hash) !== "x402")
      throw new MerchantError("QUOTE_NOT_FOUND", "Request a new x402 merchant quote.", 404);
    if (Date.parse(quote.expiresAt) <= this.now())
      throw new MerchantError("QUOTE_EXPIRED", "Request a new merchant quote.", 409);
    await this.requireChain().validate(getAddress(quote.vaultAddress), getAddress(quote.merchant));
    return quote;
  }

  async deliver(vaultAddress: string, proposalId: string) {
    const chain = this.requireChain();
    const vault = getAddress(vaultAddress);
    const proposal = await chain.purchase(vault, BigInt(proposalId));
    let record = this.store.ticketFor(vault, proposalId);
    if (proposal.status === 2) {
      if (!record || record.hash.toLowerCase() !== proposal.ticketHash.toLowerCase())
        throw new MerchantError(
          "TICKET_HISTORY_MISSING",
          "The paid ticket is not present in this merchant database.",
          503,
        );
      this.store.issued(vault, proposalId);
      return;
    }
    if (
      proposal.status === 3 ||
      proposal.status === 4 ||
      proposal.deadline <= BigInt(Math.floor(this.now() / 1000))
    )
      return;
    if (proposal.status !== 1)
      throw new MerchantError("PURCHASE_NOT_LOCKED", "The purchase is not fully approved.", 409);
    const quote = this.store.quote(proposal.quoteHash);
    if (this.store.quoteProtocol(proposal.quoteHash) === "x402")
      throw new MerchantError(
        "X402_VAULT_ADAPTER_REQUIRED",
        "This quote requires x402 settlement.",
        409,
      );
    if (
      !quote ||
      quote.vaultAddress.toLowerCase() !== vault.toLowerCase() ||
      hashTypedData(quoteTypedData(quote)) !== proposal.quoteHash
    )
      throw new MerchantError(
        "QUOTE_HISTORY_MISSING",
        "The signed purchase quote is not present.",
        503,
      );
    const merchant = this.catalogData.find(
      (entry) =>
        this.options.accounts.get(entry.id)?.address.toLowerCase() ===
        proposal.merchant.toLowerCase(),
    );
    const account = merchant ? this.options.accounts.get(merchant.id) : undefined;
    if (
      !merchant ||
      !account ||
      quote.merchant.toLowerCase() !== account.address.toLowerCase() ||
      BigInt(quote.total) !== proposal.total
    )
      throw new MerchantError(
        "MERCHANT_MISMATCH",
        "This service cannot deliver that merchant's purchase.",
        403,
      );
    await chain.validate(vault, account.address);
    if (!record) {
      const id = randomBytes(32).toString("base64url");
      const url = new URL(this.options.publicUrl);
      url.pathname = `${url.pathname.replace(/\/$/, "")}/tickets/${id}`;
      url.search = "";
      url.hash = "";
      const ticket = Ticket.parse({
        proposalId,
        code: randomBytes(12).toString("base64url"),
        url: url.toString(),
        holders: proposal.participants,
      });
      const bundle = TicketBundle.parse({
        ticket,
        vaultAddress: vault,
        merchantName: merchant.name,
        title: quote.title,
        location: quote.location,
        startsAt: quote.startsAt,
        quantity: quote.quantity,
      });
      const payload = JSON.stringify(bundle);
      record = this.store.prepare({
        id,
        vault,
        proposal_id: proposalId,
        payload,
        hash: keccak256(stringToHex(payload)),
      });
    }
    if (keccak256(stringToHex(record.payload)) !== record.hash)
      throw new MerchantError(
        "TICKET_CORRUPTED",
        "The persisted ticket does not match its hash.",
        503,
      );
    await chain.fulfill(vault, BigInt(proposalId), record.hash as `0x${string}`, account);
    this.store.issued(vault, proposalId);
  }

  ticket(id: string) {
    const record = this.store.ticket(id);
    if (!record) throw new MerchantError("TICKET_NOT_FOUND", "This ticket is not available.", 404);
    return this.publicTicket(record);
  }

  ticketFor(vault: string, proposalId: string) {
    const record = this.store.ticketFor(vault, proposalId);
    if (record?.status !== "issued")
      throw new MerchantError("TICKET_NOT_FOUND", "This ticket is not available.", 404);
    return this.publicTicket(record);
  }

  private publicTicket(record: TicketRecord) {
    if (keccak256(stringToHex(record.payload)) !== record.hash)
      throw new MerchantError("TICKET_CORRUPTED", "The ticket could not be verified.", 503);
    return {
      ...TicketBundle.parse(JSON.parse(record.payload)),
      ticketHash: record.hash,
      payload: record.payload,
    };
  }

  sync(): Promise<void> {
    if (this.running) return this.running;
    if (this.now() < this.retryAt)
      return Promise.reject(
        new MerchantError(
          "RPC_RATE_LIMITED",
          "The merchant chain connection is temporarily rate limited. Please retry shortly.",
          503,
        ),
      );
    this.running = this.cycle()
      .then(() => {
        this.retryAt = 0;
        this.rateLimitFailures = 0;
      })
      .catch((error: unknown) => {
        if (!isRpcRateLimit(error)) throw error;
        this.retryAt = this.now() + Math.min(60_000, 15_000 * 2 ** this.rateLimitFailures);
        this.rateLimitFailures = Math.min(this.rateLimitFailures + 1, 3);
        throw new MerchantError(
          "RPC_RATE_LIMITED",
          "The merchant chain connection is temporarily rate limited. Please retry shortly.",
          503,
        );
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async cycle() {
    const chain = this.requireChain();
    const head = await chain.head();
    const cursor = this.store.cursor(chain.scope);
    if (
      cursor &&
      (BigInt(cursor.block) > head || (await chain.blockHash(BigInt(cursor.block))) !== cursor.hash)
    )
      throw new MerchantError("CHAIN_HISTORY_CHANGED", "The indexed chain history changed.", 503);
    let from = cursor ? BigInt(cursor.block) + 1n : (this.options.startBlock ?? 0n);
    while (from <= head) {
      let to = from + 199n;
      if (to > head) to = head;
      const discovered = await chain.created(from, to);
      const vaults = [...new Set([...this.store.vaults(chain.scope), ...discovered])];
      const locked = await chain.locked(vaults, from, to);
      this.store.commitScan(chain.scope, to, await chain.blockHash(to), discovered, locked);
      from = to + 1n;
    }
    for (const job of this.store.jobs(chain.scope, this.now())) {
      try {
        await this.deliver(job.vault, job.proposal_id);
        this.store.complete(chain.scope, job.vault, job.proposal_id);
      } catch (error) {
        const code = error instanceof MerchantError ? error.code : "MERCHANT_DELIVERY_FAILED";
        this.store.retry(job, this.now(), code);
      }
    }
  }

  start(interval: number) {
    if (this.timer) return;
    const run = () => {
      if (this.running || this.now() < this.retryAt) return;
      void this.sync().catch((error: unknown) =>
        process.stderr.write(
          `${JSON.stringify({ level: "error", code: isRpcRateLimit(error) ? "MERCHANT_RPC_RATE_LIMITED" : "MERCHANT_SCAN_FAILED" })}\n`,
        ),
      );
    };
    run();
    this.timer = setInterval(run, interval);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
