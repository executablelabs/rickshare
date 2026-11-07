import {
  arcTestnet,
  asHex,
  MerchantCatalog,
  quoteTypedData,
  SignedQuote,
  Trip,
} from "@rickshare/shared";
import { useQuery } from "@tanstack/react-query";
import { getAddress, hashTypedData, verifyTypedData } from "viem";
import { z } from "zod";
import { api } from "./api";
import { ApiError, readApi } from "./http";

export type Activity = {
  key: string;
  merchantId: string;
  merchantName: string;
  merchantAddress: string;
  payment?: z.infer<typeof MerchantCatalog>[number]["payment"];
  itemId: string;
  title: string;
  location: string;
  unitPrice: string;
};

export type ActivityQuote = {
  activity: Activity;
  quote: SignedQuote;
  shares: Array<{ member: string; amount: string }>;
};

function requestSignal(signal?: AbortSignal, timeout = 15_000) {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

export function useActivityCatalog(enabled = true) {
  return useQuery({
    queryKey: ["activity-catalog"],
    enabled,
    retry: false,
    queryFn: async ({ signal }): Promise<Activity[]> => {
      const merchants = await readApi(
        await api.merchants.$get({}, { init: { signal: requestSignal(signal) } }),
        MerchantCatalog,
      );
      return merchants.flatMap((merchant) => {
        const merchantAddress = merchant.address;
        if (!merchantAddress) return [];
        return merchant.items.map((item) => ({
          key: JSON.stringify([merchant.id, item.id]),
          merchantId: merchant.id,
          merchantName: merchant.name,
          merchantAddress,
          ...(merchant.payment ? { payment: merchant.payment } : {}),
          itemId: item.id,
          title: item.title,
          location: item.location,
          unitPrice: item.unitPrice,
        }));
      });
    },
  });
}

/** Quote the whole selection before submitting any purchase or reserving any money. */
export async function prepareActivityQuotes(
  trip: Trip,
  activities: Activity[],
  participants: string[],
  startsAt: Record<string, string>,
  signal?: AbortSignal,
): Promise<ActivityQuote[]> {
  if (
    activities.length === 0 ||
    activities.length > 10 ||
    new Set(activities.map((activity) => activity.key)).size !== activities.length
  )
    throw new ApiError("INVALID_SELECTION", "Choose one to ten different activities.", 400);
  if (
    participants.length === 0 ||
    participants.length > 20 ||
    new Set(participants.map((member) => member.toLowerCase())).size !== participants.length
  )
    throw new ApiError("INVALID_PARTICIPANTS", "Choose one to twenty different trip members.", 400);
  if (activities.some((activity) => activity.payment?.protocol === "x402"))
    throw new ApiError(
      "X402_VAULT_ADAPTER_REQUIRED",
      "A selected merchant's group-payment connection is not available yet. Nothing was submitted.",
      409,
    );
  const fresh = await readApi(
    await api.trips[":tripId"].$get(
      { param: { tripId: trip.id } },
      { init: { signal: requestSignal(signal) } },
    ),
    Trip,
  );
  const now = Date.now();
  if (Date.parse(fresh.endsAt) <= now)
    throw new ApiError("TRIP_ENDED", "This trip has ended. Choose an active trip.", 409);
  const members = participants.map((address) => {
    const member = fresh.members.find(
      (entry) => entry.address.toLowerCase() === address.toLowerCase(),
    );
    if (!member)
      throw new ApiError(
        "INVALID_PARTICIPANTS",
        "A selected person is no longer in this trip.",
        409,
      );
    return member;
  });
  let perPerson = 0n;
  for (const activity of activities) {
    const time = Date.parse(startsAt[activity.key] ?? "");
    if (
      !Number.isFinite(time) ||
      time <= now ||
      time > Date.parse(fresh.endsAt) ||
      (fresh.startsAt && time < Date.parse(fresh.startsAt))
    )
      throw new ApiError(
        "INVALID_ACTIVITY_TIME",
        "Choose a future time within this trip for each activity.",
        400,
      );
    if (BigInt(activity.unitPrice) <= 0n)
      throw new ApiError(
        "INVALID_ACTIVITY_PRICE",
        "This activity has no valid price. Refresh the list.",
        409,
      );
    perPerson += BigInt(activity.unitPrice);
  }
  for (const member of members)
    if (BigInt(member.available) < perPerson)
      throw new ApiError(
        "INSUFFICIENT_TRIP_BALANCE",
        `${member.displayName} needs more money in the trip for this selection. Nothing was submitted.`,
        409,
      );

  const reviews: ActivityQuote[] = [];
  for (const activity of activities) {
    const time = startsAt[activity.key];
    if (!time) throw new ApiError("INVALID_ACTIVITY_TIME", "Choose a time for each activity.", 400);
    const quote = await readApi(
      await api.trips[":tripId"].quotes.$post(
        {
          param: { tripId: trip.id },
          json: {
            merchantId: activity.merchantId,
            itemId: activity.itemId,
            quantity: members.length,
            startsAt: time,
          },
        },
        { init: { signal: requestSignal(signal) } },
      ),
      SignedQuote,
    );
    const data = quoteTypedData(quote);
    if (
      quote.merchant.toLowerCase() !== activity.merchantAddress.toLowerCase() ||
      quote.vaultAddress.toLowerCase() !== fresh.vaultAddress.toLowerCase() ||
      quote.chainId !== arcTestnet.id ||
      quote.itemId !== activity.itemId ||
      quote.title !== activity.title ||
      quote.location !== activity.location ||
      quote.quantity !== members.length ||
      quote.unitPrice !== activity.unitPrice ||
      BigInt(quote.total) !== BigInt(activity.unitPrice) * BigInt(members.length) ||
      Math.floor(Date.parse(quote.startsAt) / 1000) !== Math.floor(Date.parse(time) / 1000) ||
      Date.parse(quote.expiresAt) <= Date.now() ||
      hashTypedData(data).toLowerCase() !== quote.quoteHash.toLowerCase() ||
      !(await verifyTypedData({
        ...data,
        address: getAddress(quote.merchant),
        signature: asHex(quote.signature),
      }))
    )
      throw new ApiError(
        "QUOTE_CHANGED",
        "An activity changed or its quote could not be verified. Refresh the list and get new quotes.",
        409,
      );
    reviews.push({
      activity,
      quote,
      shares: members.map((member) => ({ member: member.address, amount: quote.unitPrice })),
    });
  }
  return reviews;
}

/** Preserve this quote on an uncertain response; a fresh quote could create a duplicate purchase. */
export async function submitActivityQuote(
  tripId: string,
  review: ActivityQuote,
  signal?: AbortSignal,
  recover = false,
) {
  if (!recover && Date.parse(review.quote.expiresAt) <= Date.now())
    throw new ApiError(
      "QUOTE_EXPIRED",
      "This quote expired. Review new quotes before booking.",
      409,
    );
  return readApi(
    await api.trips[":tripId"].proposals.$post(
      { param: { tripId }, json: { quote: review.quote, shares: review.shares } },
      { init: { signal: requestSignal(signal, 45_000) } },
    ),
    z.object({
      proposalId: z.string(),
      transactionHash: z.string().optional(),
      indexed: z.boolean().optional(),
    }),
  );
}
