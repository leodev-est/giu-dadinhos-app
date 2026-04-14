import type { ReactNode, SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ children, className = "", ...props }: SelectProps) {
  return (
    <select
      className={`ui-focus w-full appearance-none rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-4 py-3 text-sm text-text-contrast shadow-soft ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}
