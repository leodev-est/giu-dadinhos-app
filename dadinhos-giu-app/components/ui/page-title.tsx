import type { HTMLAttributes, ReactNode } from "react";

type PageTitleProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
};

export function PageTitle({
  className = "",
  eyebrow,
  subtitle,
  title,
  ...props
}: PageTitleProps) {
  return (
    <div className={`space-y-2 ${className}`.trim()} {...props}>
      {eyebrow ? (
        <span className="text-sm font-medium text-accent">{eyebrow}</span>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle ? (
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
