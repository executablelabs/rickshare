import { CaretDown, Check, Copy, UsersThree } from "@phosphor-icons/react";
import type { Trip } from "@rickshare/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";
import { messageOf } from "../../lib/http";
import { inviteApi, tripKeys } from "../../lib/trips";
import { Avatar, displayNameOf } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

const Nickname = z
  .string()
  .trim()
  .min(1, "Enter the name your friends know you by.")
  .max(32, "Keep your name to 32 characters or fewer.");

function CopyMetadata({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div>
      <div className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
        <span className="min-w-0 break-all" title={value}>
          {compact && status !== "error" ? `${value.slice(0, 6)}…${value.slice(-4)}` : value}
        </span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-paper"
        >
          {status === "copied" ? (
            <Check aria-hidden="true" size={16} />
          ) : (
            <Copy aria-hidden="true" size={16} />
          )}
        </button>
      </div>
      {status !== "idle" && (
        <p role="status" className="text-xs text-ink-muted">
          {status === "copied" ? "Copied" : "Couldn't copy. Select the text to copy it."}
        </p>
      )}
    </div>
  );
}

function NicknameEditor({ tripId, displayName }: { tripId: string; displayName: string }) {
  const client = useQueryClient();
  const hasName = displayNameOf(displayName) === displayName;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(hasName ? displayName : "");
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: (nickname: string) => inviteApi.profile(tripId, nickname),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: tripKeys.list });
      setEditing(false);
    },
  });
  function save(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = Nickname.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    mutation.mutate(parsed.data);
  }
  if (!editing)
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setName(hasName ? displayName : "");
          setError(undefined);
          mutation.reset();
          setEditing(true);
        }}
      >
        {hasName ? "Edit your name" : "Add your name"}
      </Button>
    );
  return (
    <form onSubmit={save} noValidate className="mt-3 flex flex-col gap-3">
      <Field
        label="What should the group call you?"
        autoComplete="given-name"
        maxLength={32}
        value={name}
        disabled={mutation.isPending}
        error={error ?? (mutation.isError ? messageOf(mutation.error) : undefined)}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
          mutation.reset();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save name"}
        </Button>
        <Button variant="secondary" disabled={mutation.isPending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TripNames({ trip, ownAddress }: { trip: Trip; ownAddress?: string | undefined }) {
  const ownName = trip.members.find(
    (member) => member.address.toLowerCase() === ownAddress?.toLowerCase(),
  )?.displayName;
  const [expanded, setExpanded] = useState(!!ownName && displayNameOf(ownName) !== ownName);
  const id = useId();
  if (!trip.ensName && !ownAddress) return null;
  return (
    <div className="travel-names">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center gap-2 py-3 text-left font-semibold text-ink"
      >
        <UsersThree aria-hidden="true" size={20} />
        <span>Group names</span>
        <CaretDown
          aria-hidden="true"
          size={16}
          className={expanded ? "ml-auto rotate-180" : "ml-auto"}
        />
      </button>
      <ul id={id} hidden={!expanded} className="divide-y divide-dashed divide-rule pb-3">
        {trip.members.map((member) => (
          <li key={member.address} className="py-3">
            <div className="flex items-center gap-3">
              <Avatar name={member.displayName} colorKey={member.address} size="sm" />
              <p className="font-semibold text-ink">{displayNameOf(member.displayName)}</p>
            </div>
            {member.ensName && (
              <CopyMetadata
                value={member.ensName}
                label={`${displayNameOf(member.displayName)}'s group name`}
              />
            )}
            <CopyMetadata
              value={member.address}
              label={`${displayNameOf(member.displayName)}'s address`}
              compact
            />
            {ownAddress?.toLowerCase() === member.address.toLowerCase() && (
              <NicknameEditor tripId={trip.id} displayName={member.displayName} />
            )}
          </li>
        ))}
        {trip.ensName && (
          <li className="py-3">
            <p className="font-semibold text-ink">Trip agent</p>
            <CopyMetadata value={`agent.${trip.ensName}`} label="trip agent's group name" />
          </li>
        )}
      </ul>
    </div>
  );
}
