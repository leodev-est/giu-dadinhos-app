"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDeliveryMethodLabel,
  formatOrderAddress,
  formatOrderDesiredDate,
  type DeliveryMethod,
} from "@/lib/order-formatters";
import { type OrderStatus } from "@/lib/order-status";
import {
  buildPickupWhatsAppMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp-order-message";

type AgendaOrder = {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
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

const POLLING_INTERVAL_MS = 5000;
const giuWhatsAppPhone = process.env.NEXT_PUBLIC_GIU_WHATSAPP_PHONE ?? "";

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

function summarizeItems(items: AgendaOrder["items"]) {
  if (items.length === 0) {
    return "Sem itens.";
  }

  const preview = items
    .slice(0, 3)
    .map(
      (item) =>
        `${item.quantity}x ${item.product?.name ?? item.productName ?? "Produto"}`,
    )
    .join(", ");

  const remaining = items.length - 3;

  return remaining > 0
    ? `${preview} +${remaining} ${remaining === 1 ? "item" : "itens"}`
    : preview;
}

function compareOrders(first: AgendaOrder, second: AgendaOrder) {
  const urgencyOrder: Record<OrderStatus, number> = {
    CREATED: 0,
    READY: 1,
    OUT_FOR_DELIVERY: 2,
    DELIVERED: 3,
    CANCELLED: 4,
  };

  const urgencyComparison =
    urgencyOrder[first.status] - urgencyOrder[second.status];

  if (urgencyComparison !== 0) {
    return urgencyComparison;
  }

  const desiredDateComparison = (first.desiredDate ?? "").localeCompare(
    second.desiredDate ?? "",
  );

  if (desiredDateComparison !== 0) {
    return desiredDateComparison;
  }

  return (
    new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
  );
}

export default function AgendaPage() {
  const [orders, setOrders] = useState<AgendaOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateInSaoPaulo());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [recentlyUpdatedOrderIds, setRecentlyUpdatedOrderIds] = useState<
    string[]
  >([]);
  const ordersRef = useRef<AgendaOrder[]>([]);
  const pollingInFlightRef = useRef(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const getChangedOrderIds = useCallback(
    (previousOrders: AgendaOrder[], nextOrders: AgendaOrder[]) => {
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
            previousOrder.deliveryMethod !== order.deliveryMethod ||
            previousOrder.desiredDate !== order.desiredDate ||
            previousOrder.notes !== order.notes ||
            previousOrder.totalPrice !== order.totalPrice
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
        throw new Error("Nao foi possivel carregar a agenda.");
      }

      const data = (await response.json()) as AgendaOrder[];
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
    async function hydrateAgenda() {
      try {
        await loadOrders();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar a agenda.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void hydrateAgenda();
  }, [loadOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || pollingInFlightRef.current) {
        return;
      }

      pollingInFlightRef.current = true;

      void loadOrders({ silent: true })
        .catch(() => {
          // Mantemos a agenda visivel mesmo com falha temporaria de polling.
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
  }, [loadOrders]);

  const ordersForSelectedDate = useMemo(
    () =>
      orders
        .filter((order) => order.desiredDate === selectedDate)
        .sort(compareOrders),
    [orders, selectedDate],
  );

  const deliveryOrders = useMemo(
    () =>
      ordersForSelectedDate.filter(
        (order) => order.deliveryMethod === "DELIVERY",
      ),
    [ordersForSelectedDate],
  );

  const pickupOrders = useMemo(
    () =>
      ordersForSelectedDate.filter((order) => order.deliveryMethod === "PICKUP"),
    [ordersForSelectedDate],
  );

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <PageTitle
              eyebrow="Agenda do Dia"
              title="Entregas e retiradas"
              subtitle="Veja tudo o que precisa sair na data escolhida, separado entre entrega e retirada."
            />
            <div className="w-full max-w-xs">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Data da operacao
                </span>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-text-muted">
            <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1">
              {ordersForSelectedDate.length} pedido(s) no dia
            </span>
            <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1">
              {deliveryOrders.length} entrega(s)
            </span>
            <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1">
              {pickupOrders.length} retirada(s)
            </span>
          </div>

          <p className="text-sm text-text-muted">
            Atualizacao automatica a cada 5 segundos
            {lastSyncedAt
              ? ` • Ultima sincronizacao ${lastSyncedAt.toLocaleTimeString("pt-BR")}`
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
            <p className="text-sm text-text-muted">Carregando agenda...</p>
          </Card>
        ) : null}

        {!isLoading && ordersForSelectedDate.length === 0 ? (
          <Card className="border-dashed bg-surface-muted/70">
            <p className="text-sm text-text-muted">
              Nenhum pedido com data desejada para{" "}
              {formatOrderDesiredDate(selectedDate) ?? selectedDate}.
            </p>
          </Card>
        ) : null}

        {ordersForSelectedDate.length > 0 ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Entregas
                  </h2>
                  <p className="text-sm text-text-muted">
                    Pedidos que precisam sair para entrega.
                  </p>
                </div>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                  {deliveryOrders.length}
                </span>
              </div>

              {deliveryOrders.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-background/25 px-4 py-5 text-sm text-text-muted">
                  Nenhuma entrega para esta data.
                </div>
              ) : (
                <div className="grid gap-3">
                  {deliveryOrders.map((order) => {
                    const isRecentlyUpdated = recentlyUpdatedOrderIds.includes(
                      order.id,
                    );

                    return (
                      <div
                        key={order.id}
                        className={`rounded-[var(--radius-control)] border bg-surface-muted/60 p-4 transition ${
                          isRecentlyUpdated
                            ? "border-emerald-300/40 ring-1 ring-emerald-300/40"
                            : "border-border-soft"
                        }`.trim()}
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-foreground">
                                {order.customer.name}
                              </p>
                              <p className="text-sm text-text-muted">
                                {order.customer.phone}
                              </p>
                            </div>
                            <StatusBadge status={order.status} />
                          </div>

                          <div className="grid gap-2 text-sm text-text-muted">
                            <p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p>
                            <p>Total: {formatPrice(order.totalPrice)}</p>
                            <p>Itens: {summarizeItems(order.items)}</p>
                            <p>Endereco: {formatOrderAddress(order) ?? "Nao informado"}</p>
                            <p>Pedido: {order.id}</p>
                          </div>

                          {order.notes?.trim() ? (
                            <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 px-3 py-3 text-sm text-text-muted">
                              <p className="font-medium text-foreground">
                                Observacao
                              </p>
                              <p className="mt-1">{order.notes.trim()}</p>
                            </div>
                          ) : null}

                          <Link
                            className="inline-flex w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-background/40"
                            href={`/admin/pedidos/${order.id}`}
                          >
                            Abrir detalhe
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Retiradas
                  </h2>
                  <p className="text-sm text-text-muted">
                    Pedidos para combinar retirada com a cliente.
                  </p>
                </div>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
                  {pickupOrders.length}
                </span>
              </div>

              {pickupOrders.length === 0 ? (
                <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-background/25 px-4 py-5 text-sm text-text-muted">
                  Nenhuma retirada para esta data.
                </div>
              ) : (
                <div className="grid gap-3">
                  {pickupOrders.map((order) => {
                    const isRecentlyUpdated = recentlyUpdatedOrderIds.includes(
                      order.id,
                    );
                    const pickupWhatsAppMessage = buildPickupWhatsAppMessage({
                      customerName: order.customer.name,
                      desiredDate: order.desiredDate,
                      items: order.items.map((item) => ({
                        quantity: item.quantity,
                        productName:
                          item.product?.name ?? item.productName ?? "Produto",
                      })),
                    });
                    const pickupWhatsAppUrl = buildWhatsAppLink(
                      giuWhatsAppPhone,
                      pickupWhatsAppMessage,
                    );

                    return (
                      <div
                        key={order.id}
                        className={`rounded-[var(--radius-control)] border bg-background/25 p-4 transition ${
                          isRecentlyUpdated
                            ? "border-emerald-300/40 ring-1 ring-emerald-300/40"
                            : "border-border-soft"
                        }`.trim()}
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-foreground">
                                {order.customer.name}
                              </p>
                              <p className="text-sm text-text-muted">
                                {order.customer.phone}
                              </p>
                            </div>
                            <StatusBadge status={order.status} />
                          </div>

                          <div className="grid gap-2 text-sm text-text-muted">
                            <p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p>
                            <p>Total: {formatPrice(order.totalPrice)}</p>
                            <p>Itens: {summarizeItems(order.items)}</p>
                            <p>Pedido: {order.id}</p>
                            <p>Retirada: combinar horario diretamente com a Giu</p>
                          </div>

                          {order.notes?.trim() ? (
                            <div className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 px-3 py-3 text-sm text-text-muted">
                              <p className="font-medium text-foreground">
                                Observacao
                              </p>
                              <p className="mt-1">{order.notes.trim()}</p>
                            </div>
                          ) : null}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              disabled={!pickupWhatsAppUrl}
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                if (pickupWhatsAppUrl) {
                                  window.open(
                                    pickupWhatsAppUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }
                              }}
                            >
                              Combinar retirada
                            </Button>
                            <Link
                              className="inline-flex w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-background/40"
                              href={`/admin/pedidos/${order.id}`}
                            >
                              Abrir detalhe
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </PageContainer>
    </main>
  );
}
