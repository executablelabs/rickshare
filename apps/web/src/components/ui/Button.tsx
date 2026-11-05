import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

type ButtonVariant = "primary" | "secondary" | "destructive";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-card",
  secondary: "bg-card text-ink ring-1 ring-inset ring-ink",
  destructive: "bg-transparent text-declined",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth = false,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}
