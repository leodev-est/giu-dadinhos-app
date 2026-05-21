"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDeliveryMethodLabel, formatOrderAddress, formatOrderDesiredDate, type DeliveryMethod } from "@/lib/order-formatters";
import { orderStatusConfig, type OrderStatus } from "@/lib/order-status";
import { paymentStatusConfig, type PaymentStatus } from "@/lib/payment-status";

type TrackingOrder = {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  paymentMethod?: "PIX" | "CASH";
  payment?: { status: PaymentStatus; paidAt?: string | null } | null;
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
  customer: { name: string; phone: string };
  items: Array<{ id: string; quantity: number; price: number; product: { name: string; price: number } }>;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("pt-BR");
}

const STATUS_STEPS: OrderStatus[] = ["CREATED", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];

export default function PublicOrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/pedidos/${orderId}`);
        if (!res.ok) {
          setErrorMessage("Pedido nao encontrado. Verifique o link e tente novamente.");
          return;
        }
        const data = (await res.json()) as TrackingOrder;
        setOrder(data);
      } catch {
        setErrorMessage("Nao foi possivel carregar o pedido.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadOrder();
  }, [orderId]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer className="py-10">
          <p className="text-center text-text-muted">Carregando pedido...</p>
        </PageContainer>
      </main>
    );
  }

  if (errorMessage || !order) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer className="py-10">
          <Card className="mx-auto max-w-md space-y-4 p-6 text-center">
            <p className="text-text-muted">{errorMessage || "Pedido nao encontrado."}</p>
            <Link href="/pedido">
              <Button variant="primary" fullWidth>Fazer novo pedido</Button>
            </Link>
          </Card>
        </PageContainer>
      </main>
    );
  }

  const statusCfg = orderStatusConfig[order.status];
  const isCancelled = order.status === "CANCELLED";
  const currentStepIndex = isCancelled ? -1 : STATUS_STEPS.indexOf(order.status);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 py-10">
        <div>
          <PageTitle title="Acompanhar pedido" />
          <p className="mt-1 text-sm text-text-muted">Pedido #{order.id.slice(0, 8).toUpperCase()}</p>
        </div>

        {/* Status visual */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <StatusBadge status={order.status} />
            <div>
              <p className="font-semibold text-foreground">{statusCfg.label}</p>
              <p className="text-xs text-text-muted">Atualizado em {formatDate(order.createdAt)}</p>
            </div>
          </div>

          {!isCancelled && (
            <div className="flex items-center gap-1">
              {STATUS_STEPS.map((step, idx) => {
                const cfg = orderStatusConfig[step];
                const done = currentStepIndex >= idx;
                return (
                  <div key={step} className="flex flex-1 items-center gap-1">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${done ? "bg-accent text-background" : "bg-white/10 text-text-muted"}`}
                    >
                      {idx + 1}
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 rounded transition ${done && currentStepIndex > idx ? "bg-accent" : "bg-white/10"}`} />
                    )}
                    <span className="sr-only">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Info grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Resumo</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Cliente</dt>
                <dd className="font-medium text-foreground">{order.customer.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Entrega</dt>
                <dd className="font-medium text-foreground">{formatDeliveryMethodLabel(order.deliveryMethod)}</dd>
              </div>
              {order.desiredDate && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Data desejada</dt>
                  <dd className="font-medium text-foreground">{formatOrderDesiredDate(order.desiredDate)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-text-muted">Pagamento</dt>
                <dd className="font-medium text-foreground">{order.paymentMethod === "PIX" ? "PIX" : "Dinheiro"}</dd>
              </div>
              {order.payment && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Status pag.</dt>
                  <dd className="font-medium text-foreground">
                    {paymentStatusConfig[order.payment.status].label}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {order.deliveryMethod === "DELIVERY" && (order.street || order.zipCode) && (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Endereco</h2>
              <p className="text-sm text-foreground">{formatOrderAddress(order)}</p>
            </Card>
          )}
        </div>

        {/* Items */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">Itens do pedido</h2>
          <ul className="divide-y divide-border-soft">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-foreground">
                  {item.quantity}x {item.product.name}
                </span>
                <span className="font-medium text-foreground">{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-border-soft pt-3 text-sm font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-accent">{formatPrice(order.totalPrice)}</span>
          </div>
        </Card>

        {order.notes && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">Observacoes</h2>
            <p className="text-sm text-foreground">{order.notes}</p>
          </Card>
        )}

        <div className="text-center">
          <Link href="/pedido">
            <Button variant="secondary">Fazer novo pedido</Button>
          </Link>
        </div>
      </PageContainer>
    </main>
  );
}
