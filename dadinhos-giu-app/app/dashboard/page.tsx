"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDeliveryMethodLabel,
  formatOrderDesiredDate,
  type DeliveryMethod,
} from "@/lib/order-formatters";
import { orderStatusConfig, type OrderStatus } from "@/lib/order-status";

type DashboardOrder = {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  totalPrice: number | null;
  desiredDate?: string | null;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
  };
  items: Array<{
    quantity: number;
    price: number;
    product?: {
      name: string;
    };
  }>;
};

type DailyRevenue = {
  date: string;
  revenue: number;
  ordersCount: number;
};

type WeekdayRevenue = {
  weekday: string;
  revenue: number;
  ordersCount: number;
};

const POLLING_INTERVAL_MS = 5000;
const statusOrder: OrderStatus[] = [
  "CREATED",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

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

function formatWeekday(dateString: string) {
  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(`${dateString}T12:00:00-03:00`))
    .replace(/^\p{Letter}/u, (letter) => letter.toUpperCase());
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

function summarizeItems(items: DashboardOrder["items"]) {
  if (items.length === 0) {
    return "Sem itens.";
  }

  const preview = items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.product?.name ?? "Produto"}`)
    .join(", ");
  const remaining = items.length - 3;

  return remaining > 0
    ? `${preview} +${remaining} ${remaining === 1 ? "item" : "itens"}`
    : preview;
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

function buildWeekdayRevenue(orders: DashboardOrder[]) {
  const revenueByWeekday = new Map<string, WeekdayRevenue>();

  for (const order of orders) {
    const date = getOrderDateKey(order.createdAt);
    const weekday = formatWeekday(date);
    const current = revenueByWeekday.get(weekday) ?? {
      weekday,
      revenue: 0,
      ordersCount: 0,
    };

    current.revenue += order.totalPrice ?? 0;
    current.ordersCount += 1;
    revenueByWeekday.set(weekday, current);
  }

  return Array.from(revenueByWeekday.values()).sort((first, second) => {
    if (second.revenue !== first.revenue) {
      return second.revenue - first.revenue;
    }

    return second.ordersCount - first.ordersCount;
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
        throw new Error("Nao foi possivel carregar o dashboard.");
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
            : "Nao foi possivel carregar o dashboard.",
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

  const dashboardData = useMemo(() => {
    const today = getDateKeyInSaoPaulo();
    const validOrders = orders.filter((order) => order.status !== "CANCELLED");
    const todayOrders = validOrders.filter(
      (order) => getOrderDateKey(order.createdAt) === today,
    );
    const totalOrders = validOrders.length;
    const todayOrdersCount = todayOrders.length;
    const totalRevenue = sumOrderTotals(validOrders);
    const todayRevenue = sumOrderTotals(todayOrders);
    const dailyRevenue = buildDailyRevenue(validOrders);
    const weekdayRevenue = buildWeekdayRevenue(validOrders);
    const bestSalesWeekday = weekdayRevenue[0] ?? null;
    const upcomingOrders = validOrders
      .filter((order) => order.desiredDate && order.desiredDate >= today)
      .sort((first, second) => {
        const dateComparison = (first.desiredDate ?? "").localeCompare(
          second.desiredDate ?? "",
        );

        if (dateComparison !== 0) {
          return dateComparison;
        }

        return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
      })
      .slice(0, 6);
    const statusSummary = statusOrder.map((status) => ({
      status,
      label: orderStatusConfig[status].label,
      count: orders.filter((order) => order.status === status).length,
    }));

    return {
      today,
      todayOrdersCount,
      todayRevenue,
      totalOrders,
      totalRevenue,
      bestSalesDay: dailyRevenue[0] ?? null,
      bestSalesWeekday,
      upcomingOrders,
      statusSummary,
    };
  }, [orders]);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card className="space-y-4">
          <PageTitle
            eyebrow="Dashboard"
            title="Painel rapido da operacao"
            subtitle="Veja o que aconteceu hoje, o desempenho acumulado e os proximos pedidos em uma leitura direta."
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
            <p className="text-sm text-text-muted">Carregando dashboard...</p>
          </Card>
        ) : null}

        {!isLoading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Pedidos do dia</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">
                  {dashboardData.todayOrdersCount}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Criados em {formatDate(dashboardData.today)}, sem cancelados
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Faturamento de hoje</p>
                <p className="mt-3 text-3xl font-semibold text-accent">
                  {formatPrice(dashboardData.todayRevenue)}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Soma dos pedidos validos do dia
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Total de pedidos</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">
                  {dashboardData.totalOrders}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Quantidade total de pedidos validos
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Melhor dia da semana</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {dashboardData.bestSalesWeekday
                    ? dashboardData.bestSalesWeekday.weekday
                    : "Sem vendas"}
                </p>
                <p className="mt-2 text-sm font-medium text-accent">
                  {dashboardData.bestSalesWeekday
                    ? formatPrice(dashboardData.bestSalesWeekday.revenue)
                    : formatPrice(0)}
                </p>
              </Card>

              <Card className="border-border-strong bg-surface-muted p-5">
                <p className="text-sm text-text-muted">Faturamento total</p>
                <p className="mt-3 text-3xl font-semibold text-accent">
                  {formatPrice(dashboardData.totalRevenue)}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Historico acumulado sem cancelados
                </p>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Melhor dia da semana
                    </h2>
                    <p className="text-sm text-text-muted">
                      Baseado no faturamento agregado por dia da semana.
                    </p>
                  </div>
                </div>

                {dashboardData.bestSalesWeekday ? (
                  <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-5">
                    <p className="text-sm text-text-muted">Dia da semana</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">
                      {dashboardData.bestSalesWeekday.weekday}
                    </p>
                    <p className="mt-4 text-sm text-text-muted">Faturamento</p>
                    <p className="mt-2 text-3xl font-semibold text-accent">
                      {formatPrice(dashboardData.bestSalesWeekday.revenue)}
                    </p>
                    <p className="mt-4 text-sm text-text-muted">
                      {dashboardData.bestSalesWeekday.ordersCount} pedido(s)
                      validos nesse dia da semana
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                    Ainda nao ha pedidos validos para calcular essa metrica.
                  </div>
                )}
              </Card>

              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Resumo por status
                    </h2>
                    <p className="text-sm text-text-muted">
                      Distribuicao atual dos pedidos no sistema.
                    </p>
                  </div>
                  <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                    {orders.length} pedido(s)
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {dashboardData.statusSummary.map((entry) => (
                    <div
                      key={entry.status}
                      className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <StatusBadge status={entry.status} />
                        <p className="text-2xl font-semibold text-foreground">
                          {entry.count}
                        </p>
                      </div>
                      <p className="mt-3 text-sm text-text-muted">
                        {entry.label}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Proximos pedidos
                  </h2>
                  <p className="text-sm text-text-muted">
                    Pedidos do dia ou futuros, ordenados pela data desejada mais
                    proxima.
                  </p>
                </div>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                  {dashboardData.upcomingOrders.length}
                </span>
              </div>

              {dashboardData.upcomingOrders.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                  Nenhum pedido futuro ou do dia com data desejada no momento.
                </div>
              ) : (
                <div className="grid gap-3">
                  {dashboardData.upcomingOrders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {order.customer.name}
                            </p>
                            <StatusBadge status={order.status} />
                          </div>

                          <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                            <p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p>
                            <p>Para quando: {formatOrderDesiredDate(order.desiredDate) ?? "Nao informado"}</p>
                            <p>Total: {formatPrice(order.totalPrice ?? 0)}</p>
                            <p>Pedido: {order.id}</p>
                          </div>

                          <p className="text-sm text-text-muted">
                            Resumo: {summarizeItems(order.items)}
                          </p>
                        </div>

                        <Link
                          className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                          href={`/admin/pedidos/${order.id}`}
                        >
                          Abrir detalhe
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
