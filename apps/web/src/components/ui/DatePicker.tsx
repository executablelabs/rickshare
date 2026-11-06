import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Field } from "./Field";

function CalendarChevron({ orientation }: { orientation?: string | undefined }) {
  return orientation === "left" ? (
    <CaretLeft aria-hidden="true" size={20} />
  ) : (
    <CaretRight aria-hidden="true" size={20} />
  );
}

export function DatePicker({
  value,
  onChange,
  min,
  error,
  disabled,
  label = "Ends on",
  hint = "After this day, settle the trip and withdraw any leftovers.",
  calendarLabel = "Choose trip end date",
}: {
  value: string;
  onChange: (value: string) => void;
  min: string;
  error?: string | undefined;
  disabled: boolean;
  label?: string;
  hint?: string;
  calendarLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const earliest = new Date(`${min}T00:00:00`);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <div className="relative">
      <Field
        label={label}
        type="date"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        disabled={disabled}
        hint={hint}
        className="trip-date-field"
      />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={calendarLabel}
            className="absolute top-7 right-1 inline-flex size-11 items-center justify-center rounded-control bg-card text-ink hover:bg-paper disabled:opacity-50"
          >
            <CalendarBlank aria-hidden="true" size={22} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            collisionPadding={8}
            aria-label={calendarLabel}
            className="z-50 rounded-ticket border border-rule bg-card p-2 text-ink shadow-card"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected ?? earliest}
              autoFocus
              showOutsideDays
              fixedWeeks
              startMonth={earliest}
              disabled={{ before: earliest }}
              onSelect={(day) => {
                if (!day) return;
                onChange(
                  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
                );
                setOpen(false);
              }}
              classNames={{
                root: "relative",
                months: "relative",
                month: "flex flex-col gap-2",
                month_caption: "flex h-11 items-center justify-center font-semibold",
                nav: "absolute inset-x-0 top-0 flex justify-between",
                button_previous:
                  "inline-flex size-11 items-center justify-center rounded-control hover:bg-paper disabled:opacity-50",
                button_next:
                  "inline-flex size-11 items-center justify-center rounded-control hover:bg-paper disabled:opacity-50",
                month_grid: "border-collapse",
                weekdays: "flex",
                weekday: "w-11 py-2 text-center text-xs text-ink-muted",
                week: "flex",
                day: "size-11 text-center",
                day_button: "size-11 rounded-control text-sm hover:bg-paper",
                selected: "rounded-control bg-ink text-card [&_button:hover]:bg-ink",
                today: "font-bold underline underline-offset-4",
                outside: "text-ink-muted",
                disabled: "opacity-40 [&_button]:cursor-not-allowed",
                hidden: "invisible",
              }}
              components={{ Chevron: CalendarChevron }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
