import { Address } from "@rickshare/shared";
import { getAddress } from "viem";
import { z } from "zod";

export const TripParams = z.object({ tripId: Address.transform((value) => getAddress(value)) });
export const EventQuery = z.object({
  after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
