import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatOrderDesiredDate } from "@/lib/order-formatters";
import { mapDbStatusToApi, orderStatusConfig, type OrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DecimalLike = {
  toNumber: () => number;
};

type DashboardOrder = {
  id: string;
  status: string;
  totalPrice: DecimalLike;
  desiredDate?: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
    };
  }>;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

function getSaoPauloDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return { year, month, day };
}

function getTodayDateInSaoPaulo() {
  const { year, month, day } = getSaoPauloDateParts();
  return `${year}-${month}-${day}`;
}

function getDateInSaoPaulo(date: Date) {
  const { year, month, day } = getSaoPauloDateParts(date);
  return `${year}-${month}-${day}`;
}

function createSaoPauloDate(dateString: string, time: string) {
  return new Date(`${dateString}T${time}-03:00`);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

async function getRevenueForPeriod(start: Date, end: Date) {
  const orders = (await prisma.order.findMany({
    where: {
      status: {
        not: "CANCELED",
      },
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      totalPrice: true,
    },
  })) as Array<{ totalPrice: DecimalLike }>;

  return orders.reduce((total, order) => total + order.totalPrice.toNumber(), 0);
}

function summarizeItems(items: DashboardOrder["items"]) {
  if (items.length === 0) {
    return "Sem itens.";
  }

  const preview = items
    .slice(0, 2)
    .map((item) => `${item.quantity}x ${item.product.name}`)
    .join(", ");

  const remaining = items.length - 2;

  return remaining > 0
    ? `${preview} +${remaining} ${remaining === 1 ? "item" : "itens"}`
    : preview;
}

export default async function DashboardPage() {
  const today = getTodayDateInSaoPaulo();
  const todayStart = createSaoPauloDate(today, "00:00:00");
  const todayEnd = createSaoPauloDate(today, "23:59:59.999");
  const weekStart = addDays(todayStart, -6);
  const monthStart = createSaoPauloDate(`${today.slice(0, 8)}01`, "00:00:00");

  const [todayRevenue, weekRevenue, monthRevenue, orders] = await Promise.all([
    getRevenueForPeriod(todayStart, todayEnd),
    getRevenueForPeriod(weekStart, todayEnd),
    getRevenueForPeriod(monthStart, todayEnd),
    prisma.order.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const typedOrders = orders as DashboardOrder[];

  const normalizedOrders = typedOrders.map((order) => ({
    id: order.id,
    status: mapDbStatusToApi(order.status),
    totalPrice: order.totalPrice.toNumber(),
    desiredDate: order.desiredDate ?? null,
    createdAt: order.createdAt,
    createdDateKey: getDateInSaoPaulo(order.createdAt),
    customer: order.customer,
    items: order.items,
  }));

  const todayOrders = normalizedOrders.filter((order) => order.createdDateKey === today);
  const openOrdersCount = normalizedOrders.filter((order) =>
    order.status === "CREATED" || order.status === "READY",
  ).length;

  const statusSummary = (
    ["CREATED", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as OrderStatus[]
  ).map((status) => ({
    status,
    label: orderStatusConfig[status].label,
    count: normalizedOrders.filter((order) => order.status === status).length,
  }));

  const upcomingOrders = normalizedOrders
    .filter(
      (order) =>
        order.desiredDate &&
        order.desiredDate >= today &&
        order.status !== "CANCELLED",
    )
    .sort((first, second) => {
      const desiredDateComparison = (first.desiredDate ?? "").localeCompare(
        second.desiredDate ?? "",
      );

      if (desiredDateComparison !== 0) {
        return desiredDateComparison;
      }

      return first.createdAt.getTime() - second.createdAt.getTime();
    });

  const dueTodayOrders = upcomingOrders.filter((order) => order.desiredDate === today);
  const nextOrders = upcomingOrders
    .filter((order) => order.desiredDate !== today)
    .slice(0, 6);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card className="space-y-4">
          <PageTitle
            eyebrow="Dashboard"
            title="Visao geral da operacao"
            subtitle="Acompanhe o ritmo do dia, o faturamento e os proximos pedidos em uma leitura rapida."
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border-strong bg-surface-muted p-5">
              <p className="text-sm text-text-muted">Pedidos do dia</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">
                {todayOrders.length}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Criados em {today.split("-").reverse().join("/")}
              </p>
            </Card>

            <Card className="border-border-strong bg-surface-muted p-5">
              <p className="text-sm text-text-muted">Faturamento do dia</p>
              <p className="mt-3 text-3xl font-semibold text-accent">
                {formatPrice(todayRevenue)}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Cancelados ficam fora desta soma
              </p>
            </Card>

            <Card className="border-border-strong bg-surface-muted p-5">
              <p className="text-sm text-text-muted">Faturamento da semana</p>
              <p className="mt-3 text-3xl font-semibold text-accent">
                {formatPrice(weekRevenue)}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Ultimos 7 dias, incluindo hoje
              </p>
            </Card>

            <Card className="border-border-strong bg-surface-muted p-5">
              <p className="text-sm text-text-muted">Faturamento do mes</p>
              <p className="mt-3 text-3xl font-semibold text-accent">
                {formatPrice(monthRevenue)}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Desde o inicio do mes atual
              </p>
            </Card>

            <Card className="border-border-strong bg-surface-muted p-5 sm:col-span-2 xl:col-span-1">
              <p className="text-sm text-text-muted">Pedidos em aberto</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">
                {openOrdersCount}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Recebidos e prontos para expedicao
              </p>
            </Card>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Pedidos por status
                </h2>
                <p className="text-sm text-text-muted">
                  Distribuicao atual da operacao.
                </p>
              </div>
              <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                {normalizedOrders.length} pedidos
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {statusSummary.map((entry) => (
                <div
                  key={entry.status}
                  className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={entry.status} />
                    <p className="text-2xl font-semibold text-foreground">
                      {entry.count}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-text-muted">{entry.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Pedidos para hoje
                  </h2>
                  <p className="text-sm text-text-muted">
                    O que precisa ser observado agora.
                  </p>
                </div>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                  {dueTodayOrders.length}
                </span>
              </div>

              {dueTodayOrders.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                  Nenhum pedido com data desejada para hoje.
                </div>
              ) : (
                <div className="grid gap-3">
                  {dueTodayOrders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {order.customer.name}
                            </p>
                            <StatusBadge status={order.status} />
                          </div>
                          <p className="text-sm text-text-muted">
                            Pedido {order.id}
                          </p>
                          <p className="text-sm text-text-muted">
                            Para quando: {formatOrderDesiredDate(order.desiredDate)}
                          </p>
                          <p className="text-sm text-text-muted">
                            Resumo: {summarizeItems(order.items)}
                          </p>
                        </div>

                        <Link
                          className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                          href={`/admin/pedidos/${order.id}`}
                        >
                          Ver pedido
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Proximos pedidos
                  </h2>
                  <p className="text-sm text-text-muted">
                    Pedidos futuros mais proximos com data desejada.
                  </p>
                </div>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                  {nextOrders.length}
                </span>
              </div>

              {nextOrders.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">
                  Nenhum pedido futuro agendado no momento.
                </div>
              ) : (
                <div className="grid gap-3">
                  {nextOrders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                              {order.customer.name}
                            </p>
                            <p className="text-sm text-text-muted">
                              {formatOrderDesiredDate(order.desiredDate)}
                            </p>
                          </div>
                          <StatusBadge status={order.status} />
                        </div>

                        <p className="text-sm text-text-muted">
                          Resumo: {summarizeItems(order.items)}
                        </p>

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
          </div>
        </div>
      </PageContainer>
    </main>
  );
}
