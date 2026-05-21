"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";

type Coupon = {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  active: boolean;
  maxUsage: number | null;
  usageCount: number;
  expiresAt: string | null;
  createdAt: string;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Sem expiracao";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function formatCouponValue(coupon: Coupon) {
  return coupon.type === "PERCENTAGE" ? `${coupon.value}%` : formatPrice(coupon.value);
}

export default function AdminCuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [formValue, setFormValue] = useState("");
  const [formMaxUsage, setFormMaxUsage] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadCoupons() {
    try {
      const res = await fetch("/api/cupons");
      if (!res.ok) return;
      const data = (await res.json()) as Coupon[];
      setCoupons(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCoupons();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const code = formCode.trim().toUpperCase();
    const value = parseFloat(formValue);

    if (!code) return setFormError("Informe o codigo do cupom.");
    if (isNaN(value) || value <= 0) return setFormError("Informe um valor valido.");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          type: formType,
          value,
          ...(formMaxUsage ? { maxUsage: parseInt(formMaxUsage, 10) } : {}),
          ...(formExpiresAt ? { expiresAt: new Date(formExpiresAt).toISOString() } : {}),
        }),
      });
      const data = (await res.json()) as Coupon | { error?: string };
      if (!res.ok) {
        setFormError("error" in data ? data.error ?? "Erro ao criar cupom." : "Erro ao criar cupom.");
        return;
      }
      setCoupons((prev) => [data as Coupon, ...prev]);
      setShowForm(false);
      setFormCode("");
      setFormValue("");
      setFormMaxUsage("");
      setFormExpiresAt("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleCoupon(coupon: Coupon) {
    setTogglingId(coupon.id);
    try {
      const res = await fetch(`/api/cupons/${coupon.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !coupon.active }),
      });
      if (res.ok) {
        setCoupons((prev) =>
          prev.map((c) => (c.id === coupon.id ? { ...c, active: !c.active } : c)),
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 py-10">
        <div className="flex items-center justify-between">
          <PageTitle>Cupons</PageTitle>
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancelar" : "Novo cupom"}
          </Button>
        </div>

        {showForm && (
          <Card className="p-5">
            <form className="space-y-4" onSubmit={handleCreate}>
              <h2 className="font-semibold text-foreground">Criar cupom</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-text-muted">Codigo</span>
                  <Input
                    placeholder="PROMO10"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-muted">Tipo</span>
                  <Select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "PERCENTAGE" | "FIXED")}
                  >
                    <option value="PERCENTAGE">Porcentagem (%)</option>
                    <option value="FIXED">Valor fixo (R$)</option>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-muted">
                    Valor {formType === "PERCENTAGE" ? "(%)" : "(R$)"}
                  </span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={formType === "PERCENTAGE" ? "10" : "5.00"}
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-muted">Uso maximo (opcional)</span>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Ilimitado"
                    value={formMaxUsage}
                    onChange={(e) => setFormMaxUsage(e.target.value)}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-sm text-text-muted">Expira em (opcional)</span>
                  <Input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                  />
                </label>
              </div>
              {formError && (
                <p className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-2 text-sm text-red-100">
                  {formError}
                </p>
              )}
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "Criando..." : "Criar cupom"}
              </Button>
            </form>
          </Card>
        )}

        {isLoading && <p className="text-center text-text-muted">Carregando...</p>}

        {!isLoading && coupons.length === 0 && (
          <p className="text-center text-text-muted">Nenhum cupom cadastrado.</p>
        )}

        {!isLoading && coupons.length > 0 && (
          <div className="space-y-3">
            {coupons.map((coupon) => (
              <Card key={coupon.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{coupon.code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${coupon.active ? "bg-green-950/60 text-green-300" : "bg-white/10 text-text-muted"}`}
                    >
                      {coupon.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">
                    Desconto: <span className="text-foreground">{formatCouponValue(coupon)}</span>
                    {" — "}
                    Usos: <span className="text-foreground">{coupon.usageCount}{coupon.maxUsage ? `/${coupon.maxUsage}` : ""}</span>
                    {" — "}
                    Expira: <span className="text-foreground">{formatDate(coupon.expiresAt)}</span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={togglingId === coupon.id}
                  onClick={() => toggleCoupon(coupon)}
                >
                  {coupon.active ? "Desativar" : "Ativar"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </PageContainer>
    </main>
  );
}
