import type { HTMLAttributes, ReactNode } from "react";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function PageContainer({
  children,
  className = "",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-6xl px-[var(--space-page)] py-10 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
