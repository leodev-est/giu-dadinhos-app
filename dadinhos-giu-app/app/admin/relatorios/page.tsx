"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";

type ProductStat = { id: string; name: string; quantity: number; revenue: number };

type ReportData = {
  totalOrders: number;
  totalRevenue: number;
  totalCouponDiscount: number;
  deliveryCounts: { delivery: number; pickup: number };
  topProducts: ProductStat[];
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function AdminRelatoriosPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [from, setFrom] = useState(thirtyDaysAgoISO);
  const [to, setTo] = useState(todayISO);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/relatorios?from=${from}&to=${to}`);
      if (!res.ok) return;
      const data = (await res.json()) as ReportData;
      setReport(data);
    } finally {
      setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 py-10">
        <PageTitle>Relatorios</PageTitle>

        {/* Date filter */}
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1">
            <span className="text-sm text-text-muted">De</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-sm text-text-muted">Ate</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button variant="primary" onClick={load} disabled={isLoading}>
            {isLoading ? "Carregando..." : "Aplicar"}
          </Button>
        </Card>

        {report && (
          <>
            {/* KPI cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-foreground">{report.totalOrders}</p>
                <p className="mt-1 text-sm text-text-muted">Pedidos</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-accent">{formatPrice(report.totalRevenue)}</p>
                <p className="mt-1 text-sm text-text-muted">Receita total</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-foreground">{report.deliveryCounts.delivery}</p>
                <p className="mt-1 text-sm text-text-muted">Entregas</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-foreground">{report.deliveryCounts.pickup}</p>
                <p className="mt-1 text-sm text-text-muted">Retiradas</p>
              </Card>
            </div>

            {report.totalCouponDiscount > 0 && (
              <Card className="flex items-center justify-between p-4">
                <p className="text-sm text-text-muted">Total descontado com cupons</p>
                <p className="font-semibold text-green-400">- {formatPrice(report.totalCouponDiscount)}</p>
              </Card>
            )}

            {/* Top products */}
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
                Produtos mais vendidos
              </h2>
              {report.topProducts.length === 0 ? (
                <p className="text-sm text-text-muted">Sem dados para o periodo.</p>
              ) : (
                <div className="space-y-2">
                  {report.topProducts.map((product, idx) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-[var(--radius-control)] bg-white/5 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-text-muted">#{idx + 1}</span>
                        <span className="text-sm font-medium text-foreground">{product.name}</span>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <span className="text-text-muted">{product.quantity} unid.</span>
                        <span className="font-semibold text-accent">{formatPrice(product.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </PageContainer>
    </main>
  );
}
