import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`ui-focus w-full rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-4 py-3 text-sm text-text-contrast placeholder:text-[#7f6454] shadow-soft ${className}`.trim()}
      {...props}
    />
  );
}
