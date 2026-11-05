import { Address, asHex, Hex } from "@kitty/shared";
import { getAddress } from "viem";
import { z } from "zod";

export const CreateTrip = z
  .object({ name: z.string().trim().min(1).max(40), endsAt: z.string().datetime() })
  .strict();
export const ConfirmCreation = z
  .object({
    creationId: z.string().uuid(),
    transactionHash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .transform(asHex),
  })
  .strict();
export const CreateInvite = z.object({ expiresAt: z.string().datetime().optional() }).strict();
export const InviteId = z.object({ inviteId: z.string().uuid() });
export const TripInviteId = z.object({
  tripId: Address.transform((value) => getAddress(value)),
  inviteId: z.string().uuid(),
});
export const InviteToken = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const InviteSignature = z
  .object({
    signature: Hex.refine(
      (value) => value.length >= 130 && value.length <= 8194 && value.length % 2 === 0,
    ).transform(asHex),
  })
  .strict();
export const ConfirmJoin = ConfirmCreation.omit({ creationId: true });
export const MemberProfile = z.object({ displayName: z.string().trim().min(1).max(32) }).strict();
