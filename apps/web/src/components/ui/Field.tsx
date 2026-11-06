import { WarningCircle } from "@phosphor-icons/react";
import { type InputHTMLAttributes, useId } from "react";
import { cx } from "../../lib/cx";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export function Field({
  label,
  hint,
  error,
  className,
  "aria-describedby": extraDescribedBy,
  "aria-invalid": ariaInvalid,
  ...inputProps
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId, extraDescribedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        // A visible error always marks the input invalid, whatever the caller passes.
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy || undefined}
        className={cx(
          "h-12 rounded-control bg-card px-4 text-base text-ink ring-1 ring-inset",
          "placeholder:text-ink-muted disabled:opacity-50",
          "motion-safe:transition-shadow motion-safe:duration-150",
          error ? "ring-declined" : "ring-rule enabled:hover:ring-rule-strong",
        )}
      />
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-declined">
          <WarningCircle aria-hidden="true" size={20} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
