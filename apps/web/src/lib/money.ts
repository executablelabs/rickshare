import { Hex, UsdcAmount } from "@rickshare/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./api";
import { readApi } from "./http";

export const HistoryEvent = z.object({
  id: z.string(),
  name: z.string(),
  blockNumber: UsdcAmount,
  transactionHash: Hex.regex(/^0x[\da-fA-F]{64}$/),
  logIndex: z.number().int().nonnegative(),
  proposalId: UsdcAmount.nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type HistoryEvent = z.infer<typeof HistoryEvent>;
const History = z.object({
  events: z.array(HistoryEvent),
  nextCursor: z
    .string()
    .regex(/^\d{1,18}:\d{1,7}$/)
    .nullable(),
});

export function useHistory(tripId: string) {
  return useInfiniteQuery({
    queryKey: ["trips", tripId, "history"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readApi(
        await api.trips[":tripId"].history.$get({
          param: { tripId },
          query: { limit: "20", ...(pageParam ? { before: pageParam } : {}) },
        }),
        History,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 10000,
  });
}
