import { expect, test, vi } from "vitest";
import { createTransactionSender } from "./transactions";

const member = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}` as const;
const call = { from: member, to: other, data: "0x1234" } as const;

test("receipt failures resume the same hash, including simultaneous retries", async () => {
  const send = createTransactionSender();
  const broadcast = vi.fn(async () => hash);
  const receipt = vi
    .fn<() => Promise<{ status: "success" }>>()
    .mockRejectedValueOnce(new Error("RPC offline"))
    .mockResolvedValue({ status: "success" });
  await expect(send(member, call, { broadcast, receipt })).rejects.toMatchObject({
    code: "TRANSACTION_PENDING",
    transactionHash: hash,
  });
  const first = send(member, call, { broadcast, receipt });
  const second = send(member, call, { broadcast, receipt });
  expect(await first).toBe(hash);
  expect(await second).toBe(hash);
  expect(broadcast).toHaveBeenCalledTimes(1);
  expect(receipt).toHaveBeenLastCalledWith(hash);
});

test("a different sender is rejected before broadcast, and reverted transactions may be retried", async () => {
  const send = createTransactionSender();
  const broadcast = vi.fn(async () => hash);
  const receipt = vi.fn(async () => ({ status: "reverted" as const }));
  await expect(send(other, call, { broadcast, receipt })).rejects.toThrow("another account");
  expect(broadcast).not.toHaveBeenCalled();
  await expect(send(member, call, { broadcast, receipt })).rejects.toThrow("transaction failed");
  await expect(send(member, call, { broadcast, receipt })).rejects.toThrow("transaction failed");
  expect(broadcast).toHaveBeenCalledTimes(2);
});
