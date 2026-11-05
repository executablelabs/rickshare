import { WarningCircle } from "@phosphor-icons/react";
import { type InputHTMLAttributes, useId } from "react";
import { cx } from "../../lib/cx";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className, ...inputProps }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cx(
          "h-12 rounded-control bg-card px-4 text-base text-ink ring-1 ring-inset",
          "placeholder:text-ink-muted disabled:opacity-50",
          error ? "ring-declined" : "ring-rule",
        )}
        {...inputProps}
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
