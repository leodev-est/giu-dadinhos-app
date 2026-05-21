"use client";

import { type FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Senha incorreta.");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Nao foi possivel fazer login.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm space-y-6 p-6 sm:p-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Admin</p>
        <h1 className="text-2xl font-semibold text-foreground">Acesso restrito</h1>
        <p className="text-sm text-text-muted">Informe a senha para acessar o painel.</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Senha</span>
          <Input
            autoFocus
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? (
          <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <Button disabled={isLoading} fullWidth type="submit" variant="primary">
          {isLoading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="flex min-h-[calc(100vh-220px)] items-center justify-center py-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </PageContainer>
    </main>
  );
}
