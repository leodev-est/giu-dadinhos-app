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
import { useOrderNotifications } from "@/hooks/use-order-notifications";
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
  paymentMethod?: "PIX" | "CASH";
  payment?: {
    status: PaymentStatus;
    paidAt?: string | null;
    receiptNote?: string | null;
  } | null;
  totalPrice: number;
  isFirstOrder?: boolean;
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
const paymentStatuses: PaymentStatus[] = ["PENDING", "CONFIRMED", "FAILED", "EXPIRED"];
const POLLING_INTERVAL_MS = 5000;

function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | PaymentStatus>("ALL");
  const [deliveryFilter, setDeliveryFilter] = useState<"ALL" | DeliveryMethod>("ALL");
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  const [createdDateFrom, setCreatedDateFrom] = useState("");
  const [createdDateTo, setCreatedDateTo] = useState("");
  const [desiredDateFrom, setDesiredDateFrom] = useState("");
  const [desiredDateTo, setDesiredDateTo] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const pollingInFlightRef = useRef(false);
  useOrderNotifications(orders);
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

  async function handlePaymentStatusChange(
    orderId: string,
    paymentStatus: PaymentStatus,
    receiptNote?: string,
  ) {
    setErrorMessage("");
    setSuccessMessage("");
    setPendingOrderId(orderId);

    const response = await fetch(`/api/pedidos/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentStatus, paymentReceiptNote: receiptNote }),
    });

    const data = (await response.json()) as Order | ApiError;

    if (!response.ok) {
      setErrorMessage(
        "error" in data
          ? data.error ?? "Nao foi possivel atualizar o pagamento."
          : "Nao foi possivel atualizar o pagamento.",
      );
      setPendingOrderId(null);
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && "payment" in data
          ? { ...order, payment: data.payment }
          : order,
      ),
    );
    setLastSyncedAt(new Date());
    setRecentlyUpdatedOrderIds([orderId]);
    setSuccessMessage("Pagamento atualizado com sucesso.");
    setPendingOrderId(null);
  }

  async function handlePaymentReceiptNoteSave(orderId: string, receiptNote: string) {
    setErrorMessage("");
    setSuccessMessage("");
    setPendingOrderId(orderId);

    const response = await fetch(`/api/pedidos/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentReceiptNote: receiptNote }),
    });

    const data = (await response.json()) as Order | ApiError;

    if (!response.ok) {
      setErrorMessage(
        "error" in data
          ? data.error ?? "Nao foi possivel salvar a observacao do comprovante."
          : "Nao foi possivel salvar a observacao do comprovante.",
      );
      setPendingOrderId(null);
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && "payment" in data
          ? { ...order, payment: data.payment }
          : order,
      ),
    );
    setLastSyncedAt(new Date());
    setRecentlyUpdatedOrderIds([orderId]);
    setSuccessMessage("Observacao do comprovante salva.");
    setPendingOrderId(null);
  }

  function exportCSV() {
    const rows = filteredOrders.map((order) => [
      order.id,
      order.customer.name,
      order.customer.phone,
      orderStatusConfig[order.status].label,
      formatDeliveryMethodLabel(order.deliveryMethod),
      order.paymentMethod ?? "",
      order.payment?.status ?? "",
      order.totalPrice.toFixed(2),
      order.desiredDate ?? "",
      formatDate(order.createdAt),
      order.isFirstOrder ? "Sim" : "Nao",
    ]);
    const header = ["ID", "Cliente", "Telefone", "Status", "Recebimento", "Pagamento", "Status Pag.", "Total", "Para quando", "Criado em", "Primeiro pedido"];
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
    setPaymentFilter("ALL");
    setDeliveryFilter("ALL");
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

      const matchesPayment =
        paymentFilter === "ALL" || order.payment?.status === paymentFilter;

      const matchesDelivery =
        deliveryFilter === "ALL" || order.deliveryMethod === deliveryFilter;

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
        matchesPayment &&
        matchesDelivery &&
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
    deliveryFilter,
    orders,
    paymentFilter,
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
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border-strong bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                {filteredOrders.length} de {orders.length} pedido(s)
              </span>
              <Button type="button" variant="secondary" onClick={exportCSV} disabled={filteredOrders.length === 0}>
                Exportar CSV
              </Button>
            </div>
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const today = getTodayDateInSaoPaulo();
                setCreatedDateFrom(today);
                setCreatedDateTo(today);
              }}
            >
              Hoje
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPaymentFilter("PENDING")}
            >
              Aguardando pagamento
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeliveryFilter("DELIVERY")}
            >
              Para entrega
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeliveryFilter("PICKUP")}
            >
              Para retirada
            </Button>
          </div>

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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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
              <span className="text-sm font-medium text-foreground">Pagamento</span>
              <Select
                value={paymentFilter}
                onChange={(event) =>
                  setPaymentFilter(event.target.value as "ALL" | PaymentStatus)
                }
              >
                <option value="ALL">Todos</option>
                {paymentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {paymentStatusConfig[status].label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Recebimento</span>
              <Select
                value={deliveryFilter}
                onChange={(event) =>
                  setDeliveryFilter(event.target.value as "ALL" | DeliveryMethod)
                }
              >
                <option value="ALL">Todos</option>
                <option value="DELIVERY">Entrega</option>
                <option value="PICKUP">Retirada</option>
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
                        {order.isFirstOrder && (
                          <span className="rounded-full bg-blue-950/60 px-2 py-0.5 text-xs font-medium text-blue-300">
                            1º pedido
                          </span>
                        )}
                      </div>

                      <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                        <p>Telefone: {order.customer.phone}</p>
                        <p>Total: {formatPrice(order.totalPrice)}</p>
                        <p>Status: {orderStatusConfig[order.status].label}</p>
                        <p>
                          Pagamento:{" "}
                          {order.paymentMethod === "CASH"
                            ? "Dinheiro"
                            : order.payment
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

                      {order.paymentMethod === "PIX" ? (
                        <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-3">
                          <p className="text-sm font-medium text-foreground">
                            Pagamento Pix
                          </p>
                          <p className="mt-1 text-sm text-text-muted">
                            {order.payment
                              ? paymentStatusConfig[order.payment.status].label
                              : "Nao informado"}
                          </p>
                          {order.payment?.paidAt ? (
                            <p className="mt-1 text-xs text-text-muted">
                              Confirmado em {formatDate(order.payment.paidAt)}
                            </p>
                          ) : null}
                          <label className="mt-3 block space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                              Comprovante
                            </span>
                            <textarea
                              className="ui-focus min-h-20 w-full rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-3 py-2 text-sm text-text-contrast placeholder:text-[#7f6454] shadow-soft"
                              placeholder="Ex.: comprovante enviado no WhatsApp"
                              value={receiptNotes[order.id] ?? order.payment?.receiptNote ?? ""}
                              onChange={(event) =>
                                setReceiptNotes((current) => ({
                                  ...current,
                                  [order.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <Button
                            className="mt-3"
                            disabled={statusDisabled}
                            fullWidth
                            type="button"
                            variant={
                              order.payment?.status === "CONFIRMED"
                                ? "secondary"
                                : "primary"
                            }
                            onClick={() =>
                              void handlePaymentStatusChange(
                                order.id,
                                order.payment?.status === "CONFIRMED"
                                  ? "PENDING"
                                  : "CONFIRMED",
                                receiptNotes[order.id] ?? order.payment?.receiptNote ?? "",
                              )
                            }
                          >
                            {order.payment?.status === "CONFIRMED"
                              ? "Voltar para aguardando"
                              : "Marcar Pix recebido"}
                          </Button>
                          <Button
                            className="mt-2"
                            disabled={statusDisabled}
                            fullWidth
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              void handlePaymentReceiptNoteSave(
                                order.id,
                                receiptNotes[order.id] ?? order.payment?.receiptNote ?? "",
                              )
                            }
                          >
                            Salvar comprovante
                          </Button>
                        </div>
                      ) : null}

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
