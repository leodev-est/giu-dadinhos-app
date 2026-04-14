import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border-soft bg-surface p-6 text-foreground shadow-soft ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
