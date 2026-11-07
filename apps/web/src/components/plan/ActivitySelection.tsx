import { MapPin, Ticket } from "@phosphor-icons/react";
import type { ChatMessage } from "@rickshare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "../../auth/wallet";
import {
  type ActivityQuote,
  prepareActivityQuotes,
  submitActivityQuote,
  useActivityCatalog,
} from "../../lib/activities";
import { activitySuggestions } from "../../lib/activity-suggestions";
import { ApiError, messageOf } from "../../lib/http";
import { tripKeys } from "../../lib/trips";
import { Loader } from "../brand/Loader";
import { useTripActions } from "../trips/TripActions";
import { Amount } from "../ui/Amount";
import { displayNameOf } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { DatePicker } from "../ui/DatePicker";
import { Field } from "../ui/Field";

type BookingState = "ready" | "submitting" | "submitted" | "uncertain";
type BookingBatch = {
  reviews: ActivityQuote[];
  states: Record<string, BookingState>;
  error: string | null;
};

function localDay(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Only explicit catalog references from the shared planner conversation become choices. */
export function ActivitySelection({ messages }: { messages: ChatMessage[] }) {
  const { trip } = useTripActions();
  const wallet = useWallet();
  const client = useQueryClient();
  const suggested = new Set(
    messages
      .filter((message) => message.role === "agent")
      .flatMap((m) => activitySuggestions(m.text)),
  );
  const catalog = useActivityCatalog(suggested.size > 0);
  const activities = (catalog.data ?? []).filter((activity) => suggested.has(activity.key));
  const [selected, setSelected] = useState<string[]>([]);
  const [participants, setParticipants] = useState<string[]>(() =>
    trip.members
      .filter((member) => member.address.toLowerCase() === wallet.address?.toLowerCase())
      .map((member) => member.address),
  );
  const [dates, setDates] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<AbortController | null>(null);
  // Preserve immutable reviewed quotes and uncertain submissions across Plan/tab remounts.
  const batchKey = ["trips", trip.id, "activity-booking"] as const;
  const batch = useQuery<BookingBatch | null>({
    queryKey: batchKey,
    queryFn: () => null,
    initialData: null,
    enabled: false,
    gcTime: Infinity,
  });
  useEffect(() => () => running.current?.abort(), []);

  if (suggested.size === 0 && !batch.data) return null;
  const choices = activities.filter((activity) => selected.includes(activity.key));
  const perPerson = choices.reduce((total, activity) => total + BigInt(activity.unitPrice), 0n);
  const today = localDay(new Date());
  const earliest = trip.startsAt ? localDay(new Date(trip.startsAt)) : today;
  const dateMinimum = [earliest, today].sort().at(-1) ?? today;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const closed = Date.parse(trip.endsAt) <= Date.now();
  const submitted = batch.data
    ? Object.values(batch.data.states).filter((state) => state === "submitted").length
    : 0;
  const unresolved =
    batch.data &&
    Object.values(batch.data.states).some(
      (state) => state === "uncertain" || state === "submitting",
    );
  const remaining =
    batch.data?.reviews.filter((entry) => batch.data?.states[entry.activity.key] === "ready") ?? [];
  const reviewedPerPerson =
    batch.data?.reviews.reduce((total, entry) => total + BigInt(entry.quote.unitPrice), 0n) ?? 0n;
  const reviewedTotal =
    batch.data?.reviews.reduce((total, entry) => total + BigInt(entry.quote.total), 0n) ?? 0n;

  function updateBatch(change: (current: BookingBatch) => BookingBatch) {
    client.setQueryData<BookingBatch | null>(batchKey, (current) =>
      current ? change(current) : null,
    );
  }

  async function review() {
    if (running.current || client.getQueryData(batchKey) || closed) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError(null);
    try {
      const startsAt: Record<string, string> = {};
      for (const activity of choices) {
        const date = dates[activity.key];
        const time = times[activity.key];
        if (!date || !time)
          throw new Error("Choose a date and start time for each selected activity.");
        startsAt[activity.key] = new Date(`${date}T${time}`).toISOString();
      }
      const reviews = await prepareActivityQuotes(
        trip,
        choices,
        participants,
        startsAt,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      client.setQueryData<BookingBatch>(batchKey, {
        reviews,
        states: Object.fromEntries(reviews.map((entry) => [entry.activity.key, "ready"])),
        error: null,
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError(messageOf(cause));
    } finally {
      running.current = null;
      setBusy(false);
    }
  }

  async function book() {
    const current = client.getQueryData<BookingBatch | null>(batchKey);
    if (
      running.current ||
      !current ||
      Object.values(current.states).some((state) => state === "uncertain" || state === "submitting")
    )
      return;
    const pending = current.reviews.filter(
      (entry) => current.states[entry.activity.key] === "ready",
    );
    if (pending.length === 0) return;
    if (pending.some((entry) => Date.parse(entry.quote.expiresAt) <= Date.now())) {
      setError("These prices expired. Edit your selection and review fresh quotes.");
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError(null);
    updateBatch((value) => ({ ...value, error: null }));
    try {
      for (const entry of pending) {
        if (controller.signal.aborted) {
          updateBatch((value) => ({
            ...value,
            error: "Booking stopped. Remaining activities were not submitted.",
          }));
          break;
        }
        const key = entry.activity.key;
        updateBatch((value) => ({ ...value, states: { ...value.states, [key]: "submitting" } }));
        try {
          await submitActivityQuote(trip.id, entry, controller.signal);
          updateBatch((value) => ({ ...value, states: { ...value.states, [key]: "submitted" } }));
        } catch (cause) {
          updateBatch((value) => ({
            ...value,
            states: {
              ...value.states,
              [key]:
                cause instanceof ApiError && cause.code === "QUOTE_EXPIRED" ? "ready" : "uncertain",
            },
            error: `${messageOf(cause)} Check the purchase requests in Plan before retrying. Remaining activities were not submitted.`,
          }));
          break;
        }
      }
    } finally {
      running.current = null;
      setBusy(false);
      void client.invalidateQueries({ queryKey: tripKeys.one(trip.id) });
    }
  }

  async function recover(entry: ActivityQuote) {
    const current = client.getQueryData<BookingBatch | null>(batchKey);
    const key = entry.activity.key;
    if (running.current || current?.states[key] !== "uncertain") return;
    const reviewed = current.reviews.find((value) => value.activity.key === key);
    if (!reviewed) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    updateBatch((value) => ({
      ...value,
      states: { ...value.states, [key]: "submitting" },
      error: null,
    }));
    try {
      await submitActivityQuote(trip.id, reviewed, controller.signal, true);
      updateBatch((value) => ({ ...value, states: { ...value.states, [key]: "submitted" } }));
    } catch (cause) {
      updateBatch((value) => ({
        ...value,
        states: {
          ...value.states,
          [key]:
            cause instanceof ApiError && cause.code === "QUOTE_EXPIRED" ? "ready" : "uncertain",
        },
        error: messageOf(cause),
      }));
    } finally {
      running.current = null;
      setBusy(false);
      void client.invalidateQueries({ queryKey: tripKeys.one(trip.id) });
    }
  }

  return (
    <section
      aria-labelledby="activity-selection-title"
      className="my-5 flex min-w-0 flex-col gap-5 rounded-ticket border border-rule bg-paper p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-sky text-ink">
          <Ticket size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 id="activity-selection-title" className="font-display text-xl font-semibold">
            Pick your kind of adventure
          </h2>
          <p className="text-sm text-ink-muted">
            From the planner’s suggestions. Choose a few, then review the exact prices together.
          </p>
        </div>
      </div>
      {batch.data ? (
        <>
          <h3 className="font-semibold">Your selection, ready to review</h3>
          <ol className="flex flex-col gap-3">
            {batch.data.reviews.map((entry) => (
              <li
                key={entry.activity.key}
                className="rounded-ticket border border-rule bg-card p-4"
              >
                <h4 className="font-display text-lg font-semibold wrap-anywhere">
                  {entry.quote.title}
                </h4>
                <p className="text-sm text-ink-muted">{entry.activity.merchantName}</p>
                <p className="text-sm text-ink-muted">{entry.quote.location}</p>
                <p className="text-sm">{new Date(entry.quote.startsAt).toLocaleString()}</p>
                <p className="mt-2">
                  <Amount value={BigInt(entry.quote.total)} /> total
                </p>
                <p>
                  <Amount value={BigInt(entry.quote.unitPrice)} /> each
                </p>
                <p className="text-sm text-ink-muted">
                  {entry.shares
                    .map((share) =>
                      displayNameOf(
                        trip.members.find(
                          (member) => member.address.toLowerCase() === share.member.toLowerCase(),
                        )?.displayName ?? "Trip member",
                      ),
                    )
                    .join(", ")}
                </p>
                <p className="mt-2 text-sm font-semibold" role="status">
                  {batch.data?.states[entry.activity.key] === "submitted"
                    ? "Purchase request created"
                    : batch.data?.states[entry.activity.key] === "submitting"
                      ? "Creating purchase request…"
                      : batch.data?.states[entry.activity.key] === "uncertain"
                        ? "Check the plan for confirmation"
                        : "Not submitted"}
                </p>
                {batch.data?.states[entry.activity.key] === "uncertain" && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void recover(entry)}
                    aria-label={`Check same purchase request for ${entry.quote.title}`}
                  >
                    Check same request
                  </Button>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap justify-between gap-3 border-t border-dashed border-rule pt-4">
            <p>
              <span className="block text-sm text-ink-muted">Each selected person</span>
              <Amount value={reviewedPerPerson} />
            </p>
            <p>
              <span className="block text-sm text-ink-muted">Group total</span>
              <Amount value={reviewedTotal} />
            </p>
          </div>
          <p className="text-sm text-ink-muted">
            {submitted} of {batch.data.reviews.length} purchase requests created. Each person’s
            approval or existing limits still apply. A booking is confirmed only when its ticket is
            issued.
          </p>
          {batch.data.error && (
            <p role="alert" className="text-sm text-declined">
              {batch.data.error}
            </p>
          )}
          {!unresolved && remaining.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void book()} disabled={busy || closed}>
                {busy
                  ? "Booking selected…"
                  : submitted > 0
                    ? "Continue remaining activities"
                    : "Book selected activities"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setSelected(remaining.map((entry) => entry.activity.key));
                  client.setQueryData(batchKey, null);
                  setError(null);
                }}
              >
                Edit selection
              </Button>
            </div>
          )}
          {submitted === batch.data.reviews.length && (
            <Button
              variant="secondary"
              onClick={() => {
                client.setQueryData(batchKey, null);
                setSelected([]);
                setError(null);
              }}
            >
              Choose more activities
            </Button>
          )}
        </>
      ) : catalog.isPending ? (
        <Loader label="Loading suggested activities" />
      ) : catalog.isError ? (
        <div role="alert" className="flex flex-col gap-3">
          <p>{messageOf(catalog.error)}</p>
          <Button variant="secondary" onClick={() => void catalog.refetch()}>
            Try again
          </Button>
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-ink-muted">
          These suggestions are no longer in the merchant catalog. Ask the planner for current
          options.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Demo activities use test USDC and do not reserve real travel services. Times below are
            in {timezone}.
          </p>
          <fieldset disabled={busy || closed} className="flex min-w-0 flex-col gap-3">
            <legend className="mb-3 font-semibold">Which activities?</legend>
            {activities.map((activity) => {
              const checked = selected.includes(activity.key);
              return (
                <div
                  key={activity.key}
                  className="min-w-0 rounded-ticket border border-rule bg-card p-4"
                >
                  <label className="flex min-h-11 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      className="mt-1.5 size-5 shrink-0 accent-ink"
                      onChange={() => {
                        setSelected((value) =>
                          checked
                            ? value.filter((key) => key !== activity.key)
                            : [...value, activity.key],
                        );
                        setError(null);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-semibold wrap-anywhere">
                        {activity.title}
                      </span>
                      <span className="block text-sm text-ink-muted">{activity.merchantName}</span>
                      <span className="my-1 flex items-center gap-1 text-sm text-ink-muted">
                        <MapPin size={18} aria-hidden="true" />
                        {activity.location}
                      </span>
                      <span className="block font-semibold">
                        <Amount value={BigInt(activity.unitPrice)} /> per person
                      </span>
                    </span>
                  </label>
                  {checked && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-rule pt-4">
                      <DatePicker
                        label={`Date for ${activity.title}`}
                        calendarLabel={`Choose date for ${activity.title}`}
                        hint="Choose a day within your trip."
                        min={dateMinimum}
                        value={dates[activity.key] ?? ""}
                        onChange={(value) =>
                          setDates((current) => ({ ...current, [activity.key]: value }))
                        }
                        disabled={busy || closed}
                      />
                      <Field
                        type="time"
                        label={`Start time for ${activity.title}`}
                        value={times[activity.key] ?? ""}
                        onChange={(event) =>
                          setTimes((current) => ({
                            ...current,
                            [activity.key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
          <fieldset disabled={busy || closed} className="flex flex-col gap-1">
            <legend className="mb-2 font-semibold">Who’s joining these activities?</legend>
            {trip.members.map((member) => (
              <label
                key={member.address}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control bg-card px-3"
              >
                <input
                  type="checkbox"
                  className="size-5 accent-ink"
                  checked={participants.some(
                    (address) => address.toLowerCase() === member.address.toLowerCase(),
                  )}
                  onChange={() =>
                    setParticipants((current) =>
                      current.some(
                        (address) => address.toLowerCase() === member.address.toLowerCase(),
                      )
                        ? current.filter(
                            (address) => address.toLowerCase() !== member.address.toLowerCase(),
                          )
                        : [...current, member.address],
                    )
                  }
                />
                <span>
                  {displayNameOf(member.displayName)}
                  {member.address.toLowerCase() === wallet.address?.toLowerCase() ? " (you)" : ""}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-between gap-3 border-t border-dashed border-rule pt-4">
            <p>
              <span className="block text-sm text-ink-muted">Each selected person</span>
              <Amount value={perPerson} />
            </p>
            <p>
              <span className="block text-sm text-ink-muted">Group total</span>
              <Amount value={perPerson * BigInt(participants.length)} />
            </p>
          </div>
          <p className="text-sm text-ink-muted">
            Your checkboxes are a draft. Purchase requests and the itinerary are shared with
            everyone. Nobody is charged just for appearing here.
          </p>
          <Button
            onClick={() => void review()}
            disabled={busy || closed || choices.length === 0 || participants.length === 0}
          >
            {busy
              ? "Checking prices…"
              : `Review ${choices.length || "selected"} ${choices.length === 1 ? "activity" : "activities"}`}
          </Button>
        </>
      )}
      {closed && (
        <p className="text-sm text-ink-muted">
          This trip has ended. New activities cannot be booked.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-declined">
          {error}
        </p>
      )}
    </section>
  );
}
