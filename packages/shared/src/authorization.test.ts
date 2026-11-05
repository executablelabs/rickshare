import { expect, test } from "bun:test";
import { hashTypedData, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { approvalTypedData, quoteTypedData, type SignedQuote } from "./authorization";

const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const vaultAddress = "0x0000000000000000000000000000000000000123";

test("approval signatures are bound to vault, chain, participant, share and nonce", async () => {
  const input = {
    chainId: 5042002,
    vaultAddress,
    member: account.address,
    proposalId: 1n,
    amount: 10_000_000n,
    nonce: 0n,
    deadline: 2_000_000_000n,
  };
  const data = approvalTypedData(input);
  const signature = await account.signTypedData(data);
  expect(await verifyTypedData({ ...data, address: account.address, signature })).toBe(true);
  for (const changed of [
    { ...input, chainId: 1 },
    { ...input, vaultAddress: "0x0000000000000000000000000000000000000456" },
    { ...input, amount: 11_000_000n },
    { ...input, nonce: 1n },
    { ...input, proposalId: 2n },
  ]) {
    expect(
      await verifyTypedData({ ...approvalTypedData(changed), address: account.address, signature }),
    ).toBe(false);
  }
});

test("merchant signatures bind display details as well as price and quantity", () => {
  const quote: SignedQuote = {
    quoteId: "quote-1",
    itemId: "walk",
    merchant: account.address,
    title: "Guided walk",
    location: "Mumbai",
    unitPrice: "10000000",
    quantity: 2,
    total: "20000000",
    startsAt: "2030-01-01T10:00:00.000Z",
    expiresAt: "2030-01-01T09:00:00.000Z",
    chainId: 5042002,
    vaultAddress,
    quoteHash: `0x${"00".repeat(32)}`,
    signature: `0x${"00".repeat(65)}`,
  };
  const hash = hashTypedData(quoteTypedData(quote));
  expect(hashTypedData(quoteTypedData({ ...quote, title: "Different activity" }))).not.toBe(hash);
  expect(hashTypedData(quoteTypedData({ ...quote, location: "Goa" }))).not.toBe(hash);
  expect(hashTypedData(quoteTypedData({ ...quote, total: "30000000" }))).not.toBe(hash);
});
