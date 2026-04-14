"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { type OrderStatus } from "@/lib/order-status";

type DashboardOrder = {
  id: string;
  status: OrderStatus;
  totalPrice: number | null;
  createdAt: string;
};

type DailyRevenue = {
  date: string;
  revenue: number;
  ordersCount: number;
};

const POLLING_INTERVAL_MS = 5000;

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${day}/${month}/${year}`;
}

function getDateKeyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getOrderDateKey(createdAt: string) {
  return getDateKeyInSaoPaulo(new Date(createdAt));
}

function formatLastSync(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sumOrderTotals(orders: DashboardOrder[]) {
  return orders.reduce((total, order) => total + (order.totalPrice ?? 0), 0);
}

function buildDailyRevenue(orders: DashboardOrder[]) {
  const revenueByDate = new Map<string, DailyRevenue>();

  for (const order of orders) {
    const date = getOrderDateKey(order.createdAt);
    const current = revenueByDate.get(date) ?? {
      date,
      revenue: 0,
      ordersCount: 0,
    };

    current.revenue += order.totalPrice ?? 0;
    current.ordersCount += 1;
    revenueByDate.set(date, current);
  }

  return Array.from(revenueByDate.values()).sort((first, second) => {
    if (second.revenue !== first.revenue) {
      return second.revenue - first.revenue;
    }

    return first.date.localeCompare(second.date);
  });
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const pollingInFlightRef = useRef(false);

  const loadOrders = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      if (!options?.silent) {
        setErrorMessage("");
      }

      const response = await fetch("/api/pedidos", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Nao foi possivel carregar o dashboard de vendas.");
      }

      const data = (await response.json()) as DashboardOrder[];
      setOrders(data);
      setLastSyncedAt(new Date());
    },
    [],
  );

  useEffect(() => {
    async function hydrateDashboard() {
      try {
        await loadOrders();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar o dashboard de vendas.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void hydrateDashboard();
  }, [loadOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || pollingInFlightRef.current) {
        return;
      }

      pollingInFlightRef.current = true;

      void loadOrders({ silent: true })
        .catch(() => {
          // Mantemos o ultimo estado visivel mesmo com falha temporaria de rede.
        })
        .finally(() => {
          pollingInFlightRef.current = false;
        });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadOrders]);

  const metrics = useMemo(() => {
    const validOrders = orders.filter((order) => order.status !== "CANCELLED");
    const totalRevenue = sumOrderTotals(validOrders);
    const totalOrders = validOrders.length;
    const today = getDateKeyInSaoPaulo();
    const todayOrders = validOrders.filter(
      (order) => getOrderDateKey(order.createdAt) === today,
    );
    const todayRevenue = sumOrderTotals(todayOrders);
    const dailyRevenue = buildDailyRevenue(validOrders);
    const bestSalesDay = dailyRevenue[0] ?? null;

    return {
      totalRevenue,
      totalOrders,
      todayRevenue,
      bestSalesDay,
      today,
      dailyRevenue,
    };
  }, [orders]);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card className="space-y-4">
          <PageTitle
            eyebrow="Dashboard de Vendas"
            title="Visao simples do desempenho"
            subtitle="Acompanhe o faturamento, o volume de pedidos e o melhor dia de vendas com dados reais da operacao."
          />

          <p className="text-sm text-text-muted">
            Atualizacao automatica a cada 5 segundos
            {lastSyncedAt
              ? ` • Ultima sincronizacao ${formatLastSync(lastSyncedAt)}`
              : ""}
          </p>

          {errorMessage ? (
            <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}
        </Card>

        {isLoading ? (
          <Card>
            <p className="text-sm text-text-muted">
              Carregando metricas de vendas...
            </p>
          </Card>
        ) : null}

        {!isLoading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Faturamento total</p>
                <p className="mt-3 text-3xl font-semibold text-accent">
                  {formatPrice(metrics.totalRevenue)}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Soma de pedidos validos, sem cancelados
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Total de pedidos</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">
                  {metrics.totalOrders}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Quantidade total de pedidos validos
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Faturamento de hoje</p>
                <p className="mt-3 text-3xl font-semibold text-accent">
                  {formatPrice(metrics.todayRevenue)}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Considerando {formatDate(metrics.today)}
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Melhor dia</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {metrics.bestSalesDay
                    ? formatDate(metrics.bestSalesDay.date)
                    : "Sem vendas"}
                </p>
                <p className="mt-2 text-sm font-medium text-accent">
                  {metrics.bestSalesDay
                    ? formatPrice(metrics.bestSalesDay.revenue)
                    : formatPrice(0)}
                </p>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Melhor dia de vendas
                    </h2>
                    <p className="text-sm text-text-muted">
                      Agrupamento por data de criacao do pedido.
                    </p>
                  </div>
                </div>

                {metrics.bestSalesDay ? (
                  <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-5">
                    <p className="text-sm text-text-muted">Data</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">
                      {formatDate(metrics.bestSalesDay.date)}
                    </p>
                    <p className="mt-4 text-sm text-text-muted">Faturamento</p>
                    <p className="mt-2 text-3xl font-semibold text-accent">
                      {formatPrice(metrics.bestSalesDay.revenue)}
                    </p>
                    <p className="mt-4 text-sm text-text-muted">
                      {metrics.bestSalesDay.ordersCount} pedido(s) validos nesse
                      dia
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                    Ainda nao ha pedidos validos para calcular o melhor dia.
                  </div>
                )}
              </Card>

              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Dias com mais faturamento
                    </h2>
                    <p className="text-sm text-text-muted">
                      Ranking simples dos dias mais fortes da operacao.
                    </p>
                  </div>
                  <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                    {metrics.dailyRevenue.length} dia(s)
                  </span>
                </div>

                {metrics.dailyRevenue.length === 0 ? (
                  <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                    Nenhum faturamento valido encontrado.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {metrics.dailyRevenue.slice(0, 5).map((day, index) => (
                      <div
                        key={day.date}
                        className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-text-muted">
                              {index === 0 ? "Principal" : `Top ${index + 1}`}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                              {formatDate(day.date)}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-lg font-semibold text-accent">
                              {formatPrice(day.revenue)}
                            </p>
                            <p className="text-sm text-text-muted">
                              {day.ordersCount} pedido(s)
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
