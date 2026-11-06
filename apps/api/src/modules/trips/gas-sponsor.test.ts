import { afterEach, expect, mock, test } from "bun:test";
import type { WalletTransaction } from "@rickshare/shared";
import { getAddress, keccak256 } from "viem";
import { type AppDatabase, createDatabase } from "../../db/client";
import { tripGasSponsorships } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { GasSponsorChain } from "./gas-chain";
import { TripGasSponsor } from "./gas-sponsor";

const recipient = getAddress("0x0000000000000000000000000000000000000001");
const transaction: WalletTransaction = {
  chainId: 5042002,
  from: recipient,
  to: getAddress("0x0000000000000000000000000000000000000002"),
  data: "0x1234",
  value: "0x0",
  maxFeePerGas: "0x9502f9000",
  maxPriorityFeePerGas: "0x3b9aca00",
};
const databases: AppDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
});

function fixture(limits = { maxFee: 100n, dailyBudget: 1000n }) {
  const db = createDatabase(":memory:");
  databases.push(db);
  const chain = {
    quote: mock(async () => 25n),
    sign: mock<GasSponsorChain["sign"]>(async () => "0x1234"),
    broadcast: mock<GasSponsorChain["broadcast"]>(async () => {}),
    confirm: mock<GasSponsorChain["confirm"]>(async () => {}),
  };
  const options = { ...limits, now: () => Date.UTC(2026, 10, 6) };
  return { db, chain, options, sponsor: new TripGasSponsor(db, chain, options) };
}

test("the app funds the full fee and confirms it before the user is asked to transact", async () => {
  const f = fixture();
  await f.sponsor.cover("creation", transaction);
  expect(f.chain.quote).toHaveBeenCalledWith(transaction);
  expect(f.chain.sign).toHaveBeenCalledWith(recipient, 25n);
  expect(f.chain.broadcast).toHaveBeenCalledWith("0x1234", keccak256("0x1234"));
  expect(f.db.select().from(tripGasSponsorships).get()?.confirmed).toBe(true);
  await f.sponsor.cover("creation", transaction);
  expect(f.chain.sign).toHaveBeenCalledTimes(1);
  expect(f.chain.broadcast).toHaveBeenCalledTimes(1);
});

test("a restart after broadcast resumes the saved transfer without sending a second allowance", async () => {
  const f = fixture();
  f.chain.confirm.mockRejectedValueOnce(new Error("Receipt timed out"));
  await expect(f.sponsor.cover("creation", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_UNAVAILABLE",
  });
  const pending = f.db.select().from(tripGasSponsorships).get();
  expect(pending?.signedTransaction).toBe("0x1234");
  expect(pending?.confirmed).toBe(false);
  await new TripGasSponsor(f.db, f.chain, f.options).cover("creation", transaction);
  expect(f.chain.sign).toHaveBeenCalledTimes(1);
  expect(f.chain.broadcast.mock.calls[1]).toEqual(f.chain.broadcast.mock.calls[0]);
  expect(f.db.select().from(tripGasSponsorships).get()?.confirmed).toBe(true);
});

test("concurrent retries share the persisted funding transfer", async () => {
  const f = fixture();
  await Promise.all([
    f.sponsor.cover("creation", transaction),
    f.sponsor.cover("creation", transaction),
  ]);
  expect(f.db.select().from(tripGasSponsorships).all()).toHaveLength(1);
  expect(new Set(f.chain.broadcast.mock.calls.map((call) => call[1])).size).toBe(1);
});

test("per-creation and daily budgets reject requests before spending", async () => {
  const capped = fixture({ maxFee: 24n, dailyBudget: 100n });
  await expect(capped.sponsor.cover("expensive", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_FEE_LIMIT",
  });
  expect(capped.chain.sign).not.toHaveBeenCalled();
  const f = fixture({ maxFee: 25n, dailyBudget: 25n });
  await f.sponsor.cover("first", transaction);
  await expect(f.sponsor.cover("second", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_DAILY_LIMIT",
  });
  expect(f.chain.sign).toHaveBeenCalledTimes(1);
});

test("a wallet can claim at most five creation allowances per UTC day", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) await f.sponsor.cover(`creation-${i}`, transaction);
  await expect(f.sponsor.cover("sixth", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_WALLET_LIMIT",
  });
  expect(f.chain.sign).toHaveBeenCalledTimes(5);
});

test("a new creation recovers outstanding funding before allocating another sponsor nonce", async () => {
  const f = fixture();
  f.chain.confirm.mockRejectedValueOnce(new Error("Receipt timed out"));
  await expect(f.sponsor.cover("first", transaction)).rejects.toThrow();
  await f.sponsor.cover("second", transaction);
  expect(f.chain.sign).toHaveBeenCalledTimes(2);
  expect(f.chain.confirm.mock.calls[1]).toEqual(f.chain.confirm.mock.calls[0]);
  expect(
    f.db
      .select()
      .from(tripGasSponsorships)
      .all()
      .every((row) => row.confirmed),
  ).toBe(true);
});

test("an allowance cannot be reused by a different recipient", async () => {
  const f = fixture();
  await f.sponsor.cover("creation", transaction);
  await expect(
    f.sponsor.cover("creation", { ...transaction, from: transaction.to }),
  ).rejects.toMatchObject({ code: "GAS_SPONSOR_MISMATCH" });
  expect(f.chain.sign).toHaveBeenCalledTimes(1);
});

test("retries use the original funded fees even if current RPC fee estimates change", async () => {
  const f = fixture();
  await f.sponsor.cover("creation", transaction);
  const retried = await f.sponsor.cover("creation", {
    ...transaction,
    maxFeePerGas: "0x12345678900",
  });
  expect(retried).toEqual(transaction);
  expect(f.chain.sign).toHaveBeenCalledTimes(1);
});

test("a reverted funding transfer is recorded and does not block unrelated creations", async () => {
  const f = fixture();
  f.chain.confirm.mockRejectedValueOnce(new AppError("GAS_SPONSOR_REVERTED", "Reverted", 503));
  await expect(f.sponsor.cover("first", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_REVERTED",
  });
  await f.sponsor.cover("second", transaction);
  expect(f.chain.sign).toHaveBeenCalledTimes(2);
  await expect(f.sponsor.cover("first", transaction)).rejects.toMatchObject({
    code: "GAS_SPONSOR_REVERTED",
  });
  expect(f.chain.sign).toHaveBeenCalledTimes(2);
});
