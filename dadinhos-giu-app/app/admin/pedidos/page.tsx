"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDeliveryMethodLabel,
  formatOrderAddress,
  formatOrderDesiredDate,
  type DeliveryMethod,
} from "@/lib/order-formatters";
import { Input } from "@/components/ui/input";
import { orderStatusConfig, type OrderStatus } from "@/lib/order-status";
import { paymentStatusConfig, type PaymentStatus } from "@/lib/payment-status";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

type Order = {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  payment?: {
    provider: "MANUAL_PIX" | "ASAAS";
    status: PaymentStatus;
    externalId?: string | null;
    expiresAt?: string | null;
    paidAt?: string | null;
  } | null;
  totalPrice: number;
  desiredDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  notes?: string | null;
  createdAt: string;
  customer: {
    id?: string;
    name: string;
    phone: string;
    cpfCnpj?: string | null;
  };
  items: Array<{
    id?: string;
    quantity: number;
    price: number;
    product?: {
      id?: string;
      name: string;
      price?: number;
    };
    productName?: string;
  }>;
};

type ApiError = {
  error?: string;
};

const orderStatuses: OrderStatus[] = [
  "CREATED",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];
const POLLING_INTERVAL_MS = 5000;

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("pt-BR");
}

function getItemLabel(item: Order["items"][number]) {
  if (item.product?.name) {
    return item.product.name;
  }

  return item.productName ?? "Produto";
}

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [recentlyUpdatedOrderIds, setRecentlyUpdatedOrderIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [createdDateFrom, setCreatedDateFrom] = useState("");
  const [createdDateTo, setCreatedDateTo] = useState("");
  const [desiredDateFrom, setDesiredDateFrom] = useState("");
  const [desiredDateTo, setDesiredDateTo] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const pollingInFlightRef = useRef(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordersRef = useRef<Order[]>([]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const getChangedOrderIds = useCallback(
    (previousOrders: Order[], nextOrders: Order[]) => {
    const previousById = new Map(
      previousOrders.map((order) => [order.id, order] as const),
    );

    return nextOrders
      .filter((order) => {
        const previousOrder = previousById.get(order.id);

        if (!previousOrder) {
          return true;
        }

        return (
          previousOrder.status !== order.status ||
          previousOrder.totalPrice !== order.totalPrice ||
          previousOrder.desiredDate !== order.desiredDate ||
          previousOrder.deliveryMethod !== order.deliveryMethod ||
          previousOrder.notes !== order.notes ||
          previousOrder.payment?.status !== order.payment?.status
        );
      })
      .map((order) => order.id);
    },
    [],
  );

  const loadOrders = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      if (!options?.silent) {
        setErrorMessage("");
      }

      const response = await fetch("/api/pedidos", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Nao foi possivel carregar os pedidos.");
      }

      const data = (await response.json()) as Order[];
      const changedOrderIds = getChangedOrderIds(ordersRef.current, data);

      setOrders(data);
      setLastSyncedAt(new Date());

      if (changedOrderIds.length > 0) {
        setRecentlyUpdatedOrderIds(changedOrderIds);

        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }

        highlightTimeoutRef.current = setTimeout(() => {
          setRecentlyUpdatedOrderIds([]);
        }, 3500);
      }
    },
    [getChangedOrderIds],
  );

  useEffect(() => {
    async function hydrateOrders() {
      try {
        await loadOrders();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar os pedidos.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void hydrateOrders();
  }, [loadOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || pendingOrderId || pollingInFlightRef.current) {
        return;
      }

      pollingInFlightRef.current = true;

      void loadOrders({ silent: true })
        .catch(() => {
          // Mantemos o ultimo estado renderizado para evitar flicker ou quebra
          // operacional durante falhas temporarias de rede.
        })
        .finally(() => {
          pollingInFlightRef.current = false;
        });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [loadOrders, pendingOrderId]);

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    setErrorMessage("");
    setSuccessMessage("");
    setPendingOrderId(orderId);

    const response = await fetch(`/api/pedidos/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    const data = (await response.json()) as Order | ApiError;

    if (!response.ok) {
      setErrorMessage(
        "error" in data
          ? data.error ?? "Nao foi possivel atualizar o pedido."
          : "Nao foi possivel atualizar o pedido.",
      );
      setPendingOrderId(null);
      return;
    }

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId && "status" in data
            ? { ...order, status: data.status }
            : order,
        ),
      );
    setLastSyncedAt(new Date());
    setRecentlyUpdatedOrderIds([orderId]);
    setSuccessMessage("Status do pedido atualizado com sucesso.");
    setPendingOrderId(null);
  }

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCreatedDateFrom("");
    setCreatedDateTo("");
    setDesiredDateFrom("");
    setDesiredDateTo("");
  }

  const filteredOrders = useMemo(() => {
    const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !normalizedSearchTerm ||
        order.customer.name.toLowerCase().includes(normalizedSearchTerm) ||
        order.customer.phone.toLowerCase().includes(normalizedSearchTerm);

      const matchesStatus =
        statusFilter === "ALL" || order.status === statusFilter;

      const createdDate = order.createdAt.slice(0, 10);
      const matchesCreatedDateFrom =
        !createdDateFrom || createdDate >= createdDateFrom;
      const matchesCreatedDateTo =
        !createdDateTo || createdDate <= createdDateTo;

      const desiredDate = order.desiredDate ?? "";
      const matchesDesiredDateFrom =
        !desiredDateFrom || Boolean(desiredDate && desiredDate >= desiredDateFrom);
      const matchesDesiredDateTo =
        !desiredDateTo || Boolean(desiredDate && desiredDate <= desiredDateTo);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCreatedDateFrom &&
        matchesCreatedDateTo &&
        matchesDesiredDateFrom &&
        matchesDesiredDateTo
      );
    });
  }, [
    createdDateFrom,
    createdDateTo,
    deferredSearchTerm,
    desiredDateFrom,
    desiredDateTo,
    orders,
    statusFilter,
  ]);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <PageTitle
              eyebrow="Admin de Pedidos"
              title="Operacao dos pedidos"
              subtitle="Acompanhe pedidos reais e atualize o status diretamente pela interface."
            />
            <span className="rounded-full border border-border-strong bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
              {filteredOrders.length} de {orders.length} pedido(s)
            </span>
          </div>
          <p className="mt-3 text-sm text-text-muted">
            Atualizacao automatica a cada 5 segundos
            {lastSyncedAt
              ? ` • Ultima sincronizacao ${lastSyncedAt.toLocaleTimeString("pt-BR")}`
              : ""}
          </p>

          {errorMessage ? (
            <div className="mt-4 rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-[var(--radius-control)] border border-emerald-300/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
              {successMessage}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full lg:max-w-md">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Buscar por cliente ou telefone
                </span>
                <Input
                  placeholder="Ex.: Giulia ou 1199999"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>

            <Button type="button" variant="ghost" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Status</span>
              <Select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "ALL" | OrderStatus)
                }
              >
                <option value="ALL">Todos</option>
                {orderStatuses.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusConfig[status].label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Criado a partir de
              </span>
              <Input
                type="date"
                value={createdDateFrom}
                onChange={(event) => setCreatedDateFrom(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Criado ate
              </span>
              <Input
                type="date"
                value={createdDateTo}
                onChange={(event) => setCreatedDateTo(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Para quando a partir de
              </span>
              <Input
                type="date"
                value={desiredDateFrom}
                onChange={(event) => setDesiredDateFrom(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Para quando ate
              </span>
              <Input
                type="date"
                value={desiredDateTo}
                onChange={(event) => setDesiredDateTo(event.target.value)}
              />
            </label>
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <p className="text-sm text-text-muted">Carregando pedidos...</p>
          </Card>
        ) : null}

        {!isLoading && orders.length === 0 ? (
          <Card className="border-dashed bg-surface-muted/70">
            <p className="text-sm text-text-muted">
              Nenhum pedido encontrado no momento.
            </p>
          </Card>
        ) : null}

        {!isLoading && orders.length > 0 && filteredOrders.length === 0 ? (
          <Card className="border-dashed bg-surface-muted/70">
            <p className="text-sm text-text-muted">
              Nenhum pedido encontrado com os filtros atuais.
            </p>
          </Card>
        ) : null}

        {filteredOrders.length > 0 ? (
          <div className="grid gap-4">
            {filteredOrders.map((order) => {
              const statusDisabled = isPending && pendingOrderId === order.id;
              const isRecentlyUpdated = recentlyUpdatedOrderIds.includes(order.id);

              return (
                <Card
                  key={order.id}
                  className={`border-border-strong bg-surface-muted transition ${
                    isRecentlyUpdated
                      ? "ring-1 ring-emerald-300/50 ring-offset-2 ring-offset-background"
                      : ""
                  }`.trim()}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold">
                          {order.customer.name}
                        </h2>
                        <StatusBadge status={order.status} />
                      </div>

                      <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                        <p>Telefone: {order.customer.phone}</p>
                        <p>CPF/CNPJ: {order.customer.cpfCnpj ?? "Nao informado"}</p>
                        <p>Total: {formatPrice(order.totalPrice)}</p>
                        <p>Status: {orderStatusConfig[order.status].label}</p>
                        <p>
                          Pagamento:{" "}
                          {order.payment
                            ? paymentStatusConfig[order.payment.status].label
                            : "Nao informado"}
                        </p>
                        <p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p>
                        <p>Pedido: {order.id}</p>
                        <p>Criado em: {formatDate(order.createdAt)}</p>
                        <p>
                          Para quando:{" "}
                          {formatOrderDesiredDate(order.desiredDate) ??
                            "Nao informado"}
                        </p>
                        <p>
                          Endereco:{" "}
                          {order.deliveryMethod === "PICKUP"
                            ? "Retirada"
                            : formatOrderAddress(order) ?? "Nao informado"}
                        </p>
                      </div>

                      {order.notes ? (
                        <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 px-4 py-3">
                          <p className="text-sm font-medium text-foreground">
                            Observacao
                          </p>
                          <p className="mt-1 text-sm text-text-muted">
                            {order.notes}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="w-full max-w-xs space-y-2">
                      <label className="block text-sm font-medium text-foreground">
                        Atualizar status
                      </label>
                      <Select
                        disabled={statusDisabled}
                        value={order.status}
                        onChange={(event) =>
                          startTransition(() => {
                            void handleStatusChange(
                              order.id,
                              event.target.value as OrderStatus,
                            );
                          })
                        }
                      >
                        {orderStatuses.map((status) => (
                          <option key={status} value={status}>
                            {orderStatusConfig[status].label}
                          </option>
                        ))}
                      </Select>

                      <Link
                        className="mt-2 inline-flex w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface"
                        href={`/admin/pedidos/${order.id}`}
                      >
                        Ver detalhes
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Itens do pedido
                    </h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {order.items.map((item, index) => (
                        <div
                          key={item.id ?? `${order.id}-${index}`}
                          className="rounded-[var(--radius-control)] border border-border-soft bg-surface px-4 py-3"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {getItemLabel(item)}
                          </p>
                          <p className="mt-1 text-sm text-text-muted">
                            Quantidade: {item.quantity}
                          </p>
                          <p className="text-sm text-text-muted">
                            Preco unitario: {formatPrice(item.price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </PageContainer>
    </main>
  );
}
