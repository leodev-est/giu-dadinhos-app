import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-text-contrast hover:bg-accent-strong",
  secondary:
    "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
  ghost:
    "border-transparent bg-transparent text-foreground hover:bg-white/8",
  danger:
    "border-transparent bg-red-900/70 text-red-50 hover:bg-red-900/85",
};

export function Button({
  children,
  className = "",
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-focus inline-flex items-center justify-center rounded-[var(--radius-control)] border px-4 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
