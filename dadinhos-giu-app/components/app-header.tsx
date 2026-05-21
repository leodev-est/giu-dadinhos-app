"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const navigationLinks = [
  { href: "/pedido", label: "Novo Pedido" },
  { href: "/cardapio", label: "Cardapio" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agenda", label: "Agenda" },
  { href: "/kanban", label: "Kanban" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/produtos", label: "Produtos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/relatorios", label: "Relatorios" },
  { href: "/admin/configuracoes", label: "Configuracoes" },
  { href: "/admin/cupons", label: "Cupons" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = pathname === "/" || pathname === "/pedido" || pathname === "/cardapio" || pathname.startsWith("/pedido/");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

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

        {!isPublicPage ? (
          <nav className="flex flex-wrap items-center gap-2">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                className={`rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium transition ${pathname === link.href || pathname.startsWith(link.href + "/") ? "border-accent/40 bg-accent/10 text-accent" : "border-border-soft bg-white/5 text-foreground hover:border-border-strong hover:bg-white/10 hover:text-accent"}`}
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-red-300/20 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-950/40 disabled:opacity-50"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              {isLoggingOut ? "Saindo..." : "Sair"}
            </button>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
