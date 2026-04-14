"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationLinks = [
  { href: "/", label: "Novo Pedido" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agenda", label: "Agenda" },
  { href: "/kanban", label: "Kanban" },
  { href: "/admin/pedidos", label: "Admin Pedidos" },
  { href: "/admin/produtos", label: "Admin Produtos" },
];

export function AppHeader() {
  const pathname = usePathname();
  const isPublicOrderPage = pathname === "/";

  return (
    <header className="border-b border-border-soft bg-[#2f2018]/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-[var(--space-page)] py-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <Link
            className="inline-flex items-center text-xl font-semibold tracking-[0.08em] text-accent transition hover:text-[#ffd396]"
            href="/"
          >
            DADINHOS GIU
          </Link>
          <p className="text-sm text-text-muted">
            Feito com carinho, pronto pra encantar.
          </p>
        </div>

        {!isPublicOrderPage ? (
          <nav className="flex flex-wrap gap-2">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                className="rounded-[var(--radius-control)] border border-border-soft bg-white/5 px-4 py-2 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-white/10 hover:text-accent"
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
