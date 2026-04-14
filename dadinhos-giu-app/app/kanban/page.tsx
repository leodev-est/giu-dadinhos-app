"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatOrderDesiredDate } from "@/lib/order-formatters";
import { orderStatusConfig, type OrderStatus } from "@/lib/order-status";

type KanbanOrder = {
  id: string;
  status: OrderStatus;
  totalPrice: number;
  desiredDate?: string | null;
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
    };
    productName?: string;
  }>;
};

type ApiError = {
  error?: string;
};

type DragState = {
  orderId: string;
  originStatus: OrderStatus;
  pointerId: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  clientX: number;
  clientY: number;
};

const kanbanColumns: Array<{
  status: OrderStatus;
  title: string;
}> = [
  { status: "CREATED", title: "Recebido" },
  { status: "READY", title: "Pronto" },
  { status: "OUT_FOR_DELIVERY", title: "Saiu para entrega" },
  { status: "DELIVERED", title: "Entregue" },
  { status: "CANCELLED", title: "Cancelado" },
];
const POLLING_INTERVAL_MS = 5000;

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

function summarizeItems(items: KanbanOrder["items"]) {
  if (items.length === 0) {
    return "Sem itens.";
  }

  const preview = items
    .slice(0, 2)
    .map(
      (item) =>
        `${item.quantity}x ${item.product?.name ?? item.productName ?? "Produto"}`,
    )
    .join(", ");

  const remaining = items.length - 2;

  return remaining > 0
    ? `${preview} +${remaining} ${remaining === 1 ? "item" : "itens"}`
    : preview;
}

function compareOrders(first: KanbanOrder, second: KanbanOrder) {
  const firstDesiredDate = first.desiredDate ?? "9999-12-31";
  const secondDesiredDate = second.desiredDate ?? "9999-12-31";

  const desiredDateComparison = firstDesiredDate.localeCompare(secondDesiredDate);

  if (desiredDateComparison !== 0) {
    return desiredDateComparison;
  }

  return (
    new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
  );
}

export default function KanbanPage() {
  const [orders, setOrders] = useState<KanbanOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [recentlyUpdatedOrderIds, setRecentlyUpdatedOrderIds] = useState<string[]>([]);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredColumnStatus, setHoveredColumnStatus] =
    useState<OrderStatus | null>(null);
  const ordersRef = useRef<KanbanOrder[]>([]);
  const columnRefs = useRef<Record<OrderStatus, HTMLDivElement | null>>({
    CREATED: null,
    READY: null,
    OUT_FOR_DELIVERY: null,
    DELIVERED: null,
    CANCELLED: null,
  });
  const pollingInFlightRef = useRef(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  function getChangedOrderIds(previousOrders: KanbanOrder[], nextOrders: KanbanOrder[]) {
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
          previousOrder.desiredDate !== order.desiredDate
        );
      })
      .map((order) => order.id);
  }

  useEffect(() => {
    async function loadOrders(options?: { silent?: boolean }) {
      try {
        if (!options?.silent) {
          setErrorMessage("");
        }

        const response = await fetch("/api/pedidos", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Nao foi possivel carregar os pedidos.");
        }

        const data = (await response.json()) as KanbanOrder[];
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
      } catch (error) {
        if (!options?.silent) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Nao foi possivel carregar os pedidos.",
          );
        }
      } finally {
        setIsLoading(false);
      }
    }

    void loadOrders();
    const interval = window.setInterval(() => {
      if (
        document.hidden ||
        dragState ||
        pendingOrderId ||
        pollingInFlightRef.current
      ) {
        return;
      }

      pollingInFlightRef.current = true;

      void loadOrders({ silent: true }).finally(() => {
        pollingInFlightRef.current = false;
      });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [dragState, pendingOrderId]);

  const draggedOrder = useMemo(
    () => orders.find((order) => order.id === dragState?.orderId) ?? null,
    [dragState, orders],
  );

  const ordersByStatus = useMemo(() => {
    return kanbanColumns.map((column) => ({
      ...column,
      orders: orders
        .filter((order) => order.status === column.status)
        .sort(compareOrders),
    }));
  }, [orders]);

  function getColumnFromPointer(clientX: number, clientY: number) {
    for (const column of kanbanColumns) {
      const element = columnRefs.current[column.status];

      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return column.status;
      }
    }

    return null;
  }

  const persistStatusChange = useCallback(async (orderId: string, nextStatus: OrderStatus) => {
    const currentOrder = ordersRef.current.find((order) => order.id === orderId);

    if (!currentOrder || currentOrder.status === nextStatus) {
      return;
    }

    const previousStatus = currentOrder.status;

    setErrorMessage("");
    setSuccessMessage("");
    setPendingOrderId(orderId);
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: nextStatus } : order,
      ),
    );

    try {
      const response = await fetch(`/api/pedidos/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = (await response.json()) as KanbanOrder | ApiError;

      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error ?? "Nao foi possivel atualizar o pedido."
            : "Nao foi possivel atualizar o pedido.",
        );
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
    } catch (error) {
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: previousStatus } : order,
        ),
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o pedido.",
      );
    } finally {
      setPendingOrderId(null);
    }
  }, []);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const activeDrag = dragState;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const nextHoveredColumn = getColumnFromPointer(
        event.clientX,
        event.clientY,
      );

      setDragState((current) =>
        current
          ? {
              ...current,
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : null,
      );
      setHoveredColumnStatus(nextHoveredColumn);
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const targetStatus = getColumnFromPointer(event.clientX, event.clientY);
      const orderId = activeDrag.orderId;
      const originStatus = activeDrag.originStatus;

      setDragState(null);
      setHoveredColumnStatus(null);

      if (!targetStatus || targetStatus === originStatus) {
        return;
      }

      void persistStatusChange(orderId, targetStatus);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState, persistStatusChange]);

  function handleCardPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    order: KanbanOrder,
  ) {
    const target = event.target as HTMLElement;

    if (target.closest("a, button, select, option")) {
      return;
    }

    const currentTarget = event.currentTarget;
    const rect = currentTarget.getBoundingClientRect();

    currentTarget.setPointerCapture(event.pointerId);

    setErrorMessage("");
    setSuccessMessage("");
    setDragState({
      orderId: order.id,
      originStatus: order.status,
      pointerId: event.pointerId,
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    setHoveredColumnStatus(order.status);
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-4 py-6">
        <Card className="space-y-2.5 p-3">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between">
            <PageTitle
              className="space-y-1"
              eyebrow="Kanban"
              title="Fluxo visual dos pedidos"
              subtitle="Arraste os cards entre as colunas para atualizar o status de forma rapida."
            />
            <span className="rounded-full border border-border-strong bg-background/25 px-2.5 py-1 text-xs font-medium text-text-muted">
              {orders.length} pedido(s)
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Atualizacao automatica a cada 5 segundos
            {lastSyncedAt
              ? ` • Ultima sincronizacao ${lastSyncedAt.toLocaleTimeString("pt-BR")}`
              : ""}
          </p>

          {errorMessage ? (
            <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-3 py-2 text-xs text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-[var(--radius-control)] border border-emerald-300/30 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100">
              {successMessage}
            </div>
          ) : null}
        </Card>

        {isLoading ? (
          <Card>
            <p className="text-sm text-text-muted">Carregando pedidos...</p>
          </Card>
        ) : null}

        {!isLoading ? (
          <div className="-mx-[var(--space-page)] overflow-x-auto px-[var(--space-page)] pb-1">
            <div className="flex min-w-max gap-2">
              {ordersByStatus.map((column) => (
                <div
                  key={column.status}
                  ref={(element) => {
                    columnRefs.current[column.status] = element;
                  }}
                  className={`flex h-[calc(100vh-200px)] w-[228px] shrink-0 flex-col rounded-[var(--radius-card)] border p-2 shadow-soft transition sm:w-[236px] lg:w-[244px] ${
                    hoveredColumnStatus === column.status
                      ? "border-border-strong bg-background/35"
                      : "border-border-soft bg-surface/80"
                  }`.trim()}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
                        {column.title}
                      </h2>
                      <p className="text-[11px] text-text-muted">
                        {column.orders.length} pedido(s)
                      </p>
                    </div>
                    <StatusBadge status={column.status} />
                  </div>

                  <div className="grid flex-1 auto-rows-min gap-1.5 overflow-y-auto pr-0.5">
                    {column.orders.length === 0 ? (
                      <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-background/25 px-2.5 py-2.5 text-[10px] leading-4 text-text-muted">
                        Nenhum pedido nesta etapa.
                      </div>
                    ) : (
                      column.orders.map((order) => {
                        const isUpdatingThisOrder = pendingOrderId === order.id;
                        const isDraggingThisOrder = dragState?.orderId === order.id;
                        const isRecentlyUpdated = recentlyUpdatedOrderIds.includes(
                          order.id,
                        );

                        return (
                          <div
                            key={order.id}
                            className={`rounded-[var(--radius-card)] ${
                              isDraggingThisOrder ? "opacity-30" : ""
                            }`.trim()}
                          >
                            <Card
                              className={`border-border-strong bg-surface-muted p-2 transition hover:border-accent/60 ${
                                isRecentlyUpdated
                                  ? "ring-1 ring-emerald-300/50 ring-offset-2 ring-offset-background"
                                  : ""
                              }`.trim()}
                              onPointerDown={(event) =>
                                handleCardPointerDown(event, order)
                              }
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="line-clamp-1 text-[11px] font-semibold text-foreground">
                                      {order.customer.name}
                                    </p>
                                    <p className="line-clamp-1 text-[10px] text-text-muted">
                                      {order.customer.phone}
                                    </p>
                                  </div>
                                  <p className="shrink-0 text-[11px] font-semibold text-accent">
                                    {formatPrice(order.totalPrice)}
                                  </p>
                                </div>

                                <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted touch-none">
                                  Arraste este card
                                </div>

                                <div className="space-y-0.5 text-[10px] leading-4 text-text-muted">
                                  <p className="line-clamp-2">
                                    {summarizeItems(order.items)}
                                  </p>
                                  <p>
                                    Entrega:{" "}
                                    {formatOrderDesiredDate(order.desiredDate) ??
                                      "Nao informado"}
                                  </p>
                                </div>

                                <div className="space-y-0.5">
                                  <label className="block text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                                    Status
                                  </label>
                                  <Select
                                    disabled={isUpdatingThisOrder}
                                    value={order.status}
                                    className="py-1 text-[10px]"
                                    onChange={(event) => {
                                      void persistStatusChange(
                                        order.id,
                                        event.target.value as OrderStatus,
                                      );
                                    }}
                                  >
                                    {kanbanColumns.map((statusOption) => (
                                      <option
                                        key={statusOption.status}
                                        value={statusOption.status}
                                      >
                                        {orderStatusConfig[statusOption.status].label}
                                      </option>
                                    ))}
                                  </Select>
                                </div>

                                <Link
                                  className="inline-flex w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-2 py-1.5 text-[10px] font-semibold text-foreground transition hover:bg-background/40"
                                  href={`/admin/pedidos/${order.id}`}
                                >
                                  Ver detalhe
                                </Link>
                              </div>
                            </Card>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {dragState && draggedOrder ? (
          <div
            className="pointer-events-none fixed left-0 top-0 z-50"
            style={{
              width: `${dragState.width}px`,
              transform: `translate(${dragState.clientX - dragState.offsetX}px, ${dragState.clientY - dragState.offsetY}px) rotate(2deg)`,
            }}
          >
            <Card className="border-border-strong bg-surface-muted/95 p-2 shadow-2xl">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="line-clamp-1 text-[11px] font-semibold text-foreground">
                      {draggedOrder.customer.name}
                    </p>
                    <p className="line-clamp-1 text-[10px] text-text-muted">
                      {draggedOrder.customer.phone}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] font-semibold text-accent">
                    {formatPrice(draggedOrder.totalPrice)}
                  </p>
                </div>
                <div className="space-y-0.5 text-[10px] leading-4 text-text-muted">
                  <p className="line-clamp-2">
                    {summarizeItems(draggedOrder.items)}
                  </p>
                  <p>
                    Entrega:{" "}
                    {formatOrderDesiredDate(draggedOrder.desiredDate) ??
                      "Nao informado"}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </PageContainer>
    </main>
  );
}
