import {
  CheckCircle,
  Copy,
  HourglassMedium,
  LinkSimple,
  ShareNetwork,
} from "@phosphor-icons/react";
import { Address, arcTestnet, inviteTypedData, type Trip } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useWallet } from "../../auth/wallet";
import { ApiError, messageOf } from "../../lib/http";
import { type Invite, inviteApi, tripKeys, useInvites } from "../../lib/trips";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";

const InviteTypedData = z.object({
  domain: z.object({
    name: z.literal("Rickshare TripVault"),
    version: z.literal("1"),
    chainId: z.literal(5042002),
    verifyingContract: Address,
  }),
  primaryType: z.literal("Invite"),
  message: z.object({ member: Address, deadline: z.string().regex(/^\d+$/) }),
});

/** The API sends the deadline as a string; the contract signs it as a uint256. */
function toTypedData(raw: unknown, trip: Trip, invite: Invite) {
  const parsed = InviteTypedData.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.domain.verifyingContract.toLowerCase() !== trip.vaultAddress.toLowerCase() ||
    parsed.data.message.member.toLowerCase() !== invite.member?.toLowerCase() ||
    BigInt(parsed.data.message.deadline) <= BigInt(Math.floor(Date.now() / 1000)) ||
    BigInt(parsed.data.message.deadline) > BigInt(Math.floor(Date.parse(invite.expiresAt) / 1000))
  )
    throw new ApiError(
      "INVITE_CONTEXT_MISMATCH",
      "This invitation changed. Refresh the trip before signing.",
      409,
    );
  return inviteTypedData({
    chainId: arcTestnet.id,
    vaultAddress: trip.vaultAddress,
    member: parsed.data.message.member,
    deadline: BigInt(parsed.data.message.deadline),
  });
}

const shortAccount = (address: string | null) =>
  address ? `Account ending ${address.slice(-4).toLowerCase()}` : "Someone";

function RequestRow({ trip, invite }: { trip: Trip; invite: Invite }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function letIn() {
    setPending(true);
    try {
      const { typedData } = await inviteApi.authorization(trip.id, invite.inviteId);
      const signature = await wallet.signTypedData(toTypedData(typedData, trip, invite));
      await inviteApi.authorize(trip.id, invite.inviteId, signature);
      await queryClient.invalidateQueries({ queryKey: tripKeys.invites(trip.id) });
      showToast("They can join now");
    } catch (error) {
      showToast(messageOf(error), { tone: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{shortAccount(invite.member)}</span>
        <span className="text-sm text-ink-muted">
          {invite.status === "claimed"
            ? "Wants to join"
            : invite.status === "authorized"
              ? "Joining now"
              : "Joined"}
        </span>
      </div>
      {invite.status === "claimed" ? (
        <Button className="h-11 px-4" disabled={pending} onClick={() => void letIn()}>
          {pending ? "Letting in…" : "Let them in"}
        </Button>
      ) : invite.status === "authorized" ? (
        <HourglassMedium aria-hidden="true" size={20} className="text-marigold" />
      ) : (
        <CheckCircle aria-hidden="true" size={20} weight="fill" className="text-stamp" />
      )}
    </li>
  );
}

export function InviteSheet({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invites = useInvites(trip.id, true);
  const showToast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const requests = (invites.data ?? []).filter((invite) =>
    ["claimed", "authorized", "joined"].includes(invite.status),
  );

  async function createLink() {
    setCreating(true);
    try {
      setLink((await inviteApi.create(trip.id)).url);
    } catch (error) {
      showToast(messageOf(error), { tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    showToast("Link copied");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setLink(null);
        onOpenChange(next);
      }}
      title="Invite friends"
      description="Each link works for one person. You let them in once they open it."
    >
      <div className="flex flex-col gap-6">
        {link ? (
          <div className="flex flex-col gap-3">
            <label htmlFor="invite-link" className="text-sm font-semibold">
              Invite link
            </label>
            <input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="h-12 rounded-control bg-paper px-4 text-sm text-ink ring-1 ring-inset ring-rule"
            />
            <div className="flex gap-2.5">
              <Button fullWidth onClick={() => void copy()}>
                <Copy aria-hidden="true" size={20} />
                Copy link
              </Button>
              {typeof navigator.share === "function" && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.share({ title: trip.name, text: `Join ${trip.name}`, url: link })
                  }
                >
                  <ShareNetwork aria-hidden="true" size={20} />
                  Share
                </Button>
              )}
            </div>
            <Button variant="secondary" disabled={creating} onClick={() => void createLink()}>
              Make another link
            </Button>
          </div>
        ) : (
          <Button fullWidth disabled={creating} onClick={() => void createLink()}>
            <LinkSimple aria-hidden="true" size={20} />
            {creating ? "Creating link…" : "Create invite link"}
          </Button>
        )}

        <section aria-labelledby="requests-title" className="flex flex-col">
          <h3 id="requests-title" className="text-lg">
            Requests to join
          </h3>
          {requests.length === 0 ? (
            <p className="py-3 text-sm text-ink-muted">
              When a friend opens their link, they'll show up here for you to let in.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {requests.map((invite) => (
                <RequestRow key={invite.inviteId} trip={trip} invite={invite} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}
