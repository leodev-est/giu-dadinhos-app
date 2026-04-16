"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatDeliveryMethodLabel,
  formatOrderAddress,
  formatOrderDesiredDate,
  formatZipCode,
  type DeliveryMethod,
} from "@/lib/order-formatters";
import { orderStatusConfig, type OrderStatus } from "@/lib/order-status";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildWhatsAppLink, buildWhatsAppOrderMessage, normalizeWhatsAppPhone, type WhatsAppOrderStatus } from "@/lib/whatsapp-order-message";

type OrderDetail = {
  id: string; status: OrderStatus; totalPrice: number; desiredDate?: string | null;
  deliveryMethod: DeliveryMethod;
  paymentMethod?: "PIX" | "CASH";
  zipCode?: string | null; street?: string | null; neighborhood?: string | null; city?: string | null;
  state?: string | null; addressNumber?: string | null; addressComplement?: string | null; notes?: string | null;
  createdAt: string; customer: { id: string; name: string; phone: string; cpfCnpj?: string | null };
  items: Array<{ id: string; quantity: number; price: number; product: { id: string; name: string; price: number } }>;
  customerHistory: Array<{ id: string; status: OrderStatus; totalPrice: number; desiredDate?: string | null; createdAt: string; isCurrentOrder: boolean; items: Array<{ id: string; quantity: number; product: { id: string; name: string } }> }>;
};
type EditOrderForm = { desiredDate: string; status: OrderStatus; deliveryMethod: DeliveryMethod; zipCode: string; street: string; neighborhood: string; city: string; state: string; addressNumber: string; addressComplement: string; notes: string };
type ApiError = { error?: string };
type ViaCepResponse = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };

const orderStatuses: OrderStatus[] = ["CREATED", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
const whatsappTemplates: Array<{ status: WhatsAppOrderStatus; label: string }> = [
  { status: "CREATED", label: "Pedido recebido" }, { status: "READY", label: "Pedido pronto" },
  { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega" }, { status: "DELIVERED", label: "Pedido entregue" },
  { status: "CANCELLED", label: "Pedido cancelado" },
];

function formatPrice(price: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price); }
function formatDate(date: string) { return new Date(date).toLocaleString("pt-BR"); }
function summarizeHistoryItems(items: OrderDetail["customerHistory"][number]["items"]) {
  if (!items.length) return "Sem itens cadastrados.";
  const preview = items.slice(0, 3).map((item) => `${item.quantity}x ${item.product.name}`).join(", ");
  const remaining = items.length - 3;
  return remaining > 0 ? `${preview} +${remaining} ${remaining === 1 ? "item" : "itens"}` : preview;
}
function createEditForm(order: OrderDetail): EditOrderForm {
  return {
    desiredDate: order.desiredDate ?? "", status: order.status, deliveryMethod: order.deliveryMethod, zipCode: formatZipCode(order.zipCode ?? ""),
    street: order.street ?? "", neighborhood: order.neighborhood ?? "", city: order.city ?? "", state: order.state ?? "",
    addressNumber: order.addressNumber ?? "", addressComplement: order.addressComplement ?? "", notes: order.notes ?? "",
  };
}

export default function AdminPedidoDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppOrderStatus>("CREATED");
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [lastFetchedZipCode, setLastFetchedZipCode] = useState("");
  const [editForm, setEditForm] = useState<EditOrderForm>({ desiredDate: "", status: "CREATED", deliveryMethod: "DELIVERY", zipCode: "", street: "", neighborhood: "", city: "", state: "", addressNumber: "", addressComplement: "", notes: "" });

  useEffect(() => {
    async function loadOrder() {
      try {
        setErrorMessage(""); setSuccessMessage("");
        const response = await fetch(`/api/pedidos/${orderId}`, { cache: "no-store" });
        const data = (await response.json()) as OrderDetail | ApiError;
        if (!response.ok) {
          setErrorMessage("error" in data ? data.error ?? "Nao foi possivel carregar o pedido." : "Nao foi possivel carregar o pedido.");
          setOrder(null); return;
        }
        const nextOrder = data as OrderDetail;
        setOrder(nextOrder); setEditForm(createEditForm(nextOrder)); setLastFetchedZipCode(formatZipCode(nextOrder.zipCode ?? "")); setSelectedTemplate(nextOrder.status);
      } catch { setErrorMessage("Nao foi possivel carregar o pedido."); setOrder(null); } finally { setIsLoading(false); }
    }
    if (orderId) void loadOrder();
  }, [orderId]);

  useEffect(() => {
    if (!isEditing) return;
    const digits = editForm.zipCode.replace(/\D/g, "");
    if (digits.length !== 8) { if (digits.length < 8) setLastFetchedZipCode(""); return; }
    const normalizedZipCode = formatZipCode(editForm.zipCode);
    if (normalizedZipCode === lastFetchedZipCode) return;
    let isCancelled = false;
    async function loadAddress() {
      try {
        setIsLoadingAddress(true); setErrorMessage("");
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (!response.ok) throw new Error("Nao foi possivel buscar o CEP.");
        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) throw new Error("CEP nao encontrado.");
        if (isCancelled) return;
        setEditForm((current) => ({ ...current, street: data.logradouro ?? "", neighborhood: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "" }));
        setLastFetchedZipCode(normalizedZipCode);
      } catch (error) {
        if (isCancelled) return;
        setEditForm((current) => ({ ...current, street: "", neighborhood: "", city: "", state: "" }));
        setLastFetchedZipCode("");
        setErrorMessage(error instanceof Error ? error.message : "CEP invalido.");
      } finally { if (!isCancelled) setIsLoadingAddress(false); }
    }
    void loadAddress();
    return () => { isCancelled = true; };
  }, [editForm.zipCode, isEditing, lastFetchedZipCode]);

  const normalizedPhone = useMemo(() => (order ? normalizeWhatsAppPhone(order.customer.phone) : null), [order]);
  const whatsappMessage = useMemo(() => (order ? buildWhatsAppOrderMessage(order, selectedTemplate) : ""), [order, selectedTemplate]);
  const currentStatusMessage = useMemo(() => (order ? buildWhatsAppOrderMessage(order, order.status) : ""), [order]);
  const currentStatusWhatsappUrl = useMemo(() => (order && currentStatusMessage ? buildWhatsAppLink(order.customer.phone, currentStatusMessage) : null), [order, currentStatusMessage]);
  const whatsappUrl = useMemo(() => (order && whatsappMessage ? buildWhatsAppLink(order.customer.phone, whatsappMessage) : null), [order, whatsappMessage]);
  const hasPreviousOrders = useMemo(() => (order ? order.customerHistory.some((item) => !item.isCurrentOrder) : false), [order]);

  function openWhatsApp(url: string | null) { if (url) window.open(url, "_blank", "noopener,noreferrer"); }
  function updateEditField<Field extends keyof EditOrderForm>(field: Field, value: EditOrderForm[Field]) { setEditForm((current) => ({ ...current, [field]: value })); }
  function handleStartEdit() {
    if (!order) return;
    setErrorMessage(""); setSuccessMessage(""); setEditForm(createEditForm(order)); setLastFetchedZipCode(formatZipCode(order.zipCode ?? "")); setIsEditing(true);
  }
  function handleCancelEdit() {
    if (!order) return;
    setErrorMessage(""); setSuccessMessage(""); setIsLoadingAddress(false); setEditForm(createEditForm(order)); setLastFetchedZipCode(formatZipCode(order.zipCode ?? "")); setIsEditing(false);
  }

  useEffect(() => { if (order) setSelectedTemplate(order.status); }, [order]);

  async function handleStatusChange(nextStatus: OrderStatus) {
    if (!order || nextStatus === order.status) return;
    setErrorMessage(""); setSuccessMessage(""); setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/api/pedidos/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const data = (await response.json()) as OrderDetail | ApiError;
      if (!response.ok) {
        setErrorMessage("error" in data ? data.error ?? "Nao foi possivel atualizar o status." : "Nao foi possivel atualizar o status.");
        return;
      }
      const nextOrder = data as OrderDetail;
      setOrder(nextOrder); setEditForm(createEditForm(nextOrder)); setLastFetchedZipCode(formatZipCode(nextOrder.zipCode ?? "")); setSelectedTemplate(nextOrder.status); setSuccessMessage("Status do pedido atualizado com sucesso.");
    } catch { setErrorMessage("Nao foi possivel atualizar o status."); } finally { setIsUpdatingStatus(false); }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    setErrorMessage(""); setSuccessMessage("");
    const formattedZipCode = formatZipCode(editForm.zipCode);
    const trimmedStreet = editForm.street.trim();
    const trimmedNeighborhood = editForm.neighborhood.trim();
    const trimmedCity = editForm.city.trim();
    const trimmedState = editForm.state.trim().toUpperCase();
    const trimmedAddressNumber = editForm.addressNumber.trim();
    if (editForm.deliveryMethod === "DELIVERY" && formattedZipCode && formattedZipCode.replace(/\D/g, "").length !== 8) { setErrorMessage("Informe um CEP valido."); return; }
    if (editForm.deliveryMethod === "DELIVERY" && formattedZipCode && (!trimmedStreet || !trimmedNeighborhood || !trimmedCity || !trimmedState)) { setErrorMessage("Preencha um CEP valido para carregar o endereco."); return; }
    if (editForm.deliveryMethod === "DELIVERY" && formattedZipCode && !trimmedAddressNumber) { setErrorMessage("Informe o numero do endereco."); return; }
    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/pedidos/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status, deliveryMethod: editForm.deliveryMethod, desiredDate: editForm.desiredDate.trim(), zipCode: formattedZipCode, street: trimmedStreet,
          neighborhood: trimmedNeighborhood, city: trimmedCity, state: trimmedState, addressNumber: trimmedAddressNumber,
          addressComplement: editForm.addressComplement.trim(), notes: editForm.notes.trim(),
        }),
      });
      const data = (await response.json()) as OrderDetail | ApiError;
      if (!response.ok) {
        setErrorMessage("error" in data ? data.error ?? "Nao foi possivel salvar o pedido." : "Nao foi possivel salvar o pedido.");
        return;
      }
      const nextOrder = data as OrderDetail;
      setOrder(nextOrder); setEditForm(createEditForm(nextOrder)); setLastFetchedZipCode(formatZipCode(nextOrder.zipCode ?? "")); setSelectedTemplate(nextOrder.status); setIsEditing(false); setSuccessMessage("Pedido atualizado com sucesso.");
    } catch { setErrorMessage("Nao foi possivel salvar o pedido."); } finally { setIsSavingEdit(false); }
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6">
        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <PageTitle eyebrow="Detalhe do Pedido" title={order ? `Pedido ${order.id}` : "Carregando pedido"} subtitle="Visualize o contexto completo do pedido, edite dados operacionais e acione o cliente pelo WhatsApp em um clique." />
            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href="/admin/pedidos">Voltar para pedidos</Link>
              {order && !isEditing ? <Button type="button" variant="secondary" onClick={handleStartEdit}>Editar pedido</Button> : null}
              <Button disabled={!currentStatusWhatsappUrl} type="button" variant="primary" onClick={() => openWhatsApp(currentStatusWhatsappUrl)}>WhatsApp com status atual</Button>
            </div>
          </div>
          {errorMessage ? <div className="mt-4 rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">{errorMessage}</div> : null}
          {successMessage ? <div className="mt-4 rounded-[var(--radius-control)] border border-emerald-300/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">{successMessage}</div> : null}
          {!isLoading && order && !normalizedPhone ? <div className="mt-4 rounded-[var(--radius-control)] border border-amber-300/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">O telefone deste cliente nao parece valido para abrir o WhatsApp.</div> : null}
        </Card>

        {isLoading ? <Card><p className="text-sm text-text-muted">Carregando informacoes do pedido...</p></Card> : null}
        {!isLoading && !order && !errorMessage ? <Card className="border-dashed bg-surface-muted/70"><p className="text-sm text-text-muted">Pedido nao encontrado.</p></Card> : null}
        {order ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_380px]">
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-foreground">Cabecalho do pedido</h2>
                  <StatusBadge status={order.status} />
                </div>
                <div className="grid gap-3 text-sm text-text-muted sm:grid-cols-2">
                  <p>ID do pedido: {order.id}</p><p>Data de criacao: {formatDate(order.createdAt)}</p><p>Cliente: {order.customer.name}</p><p>Telefone: {order.customer.phone}</p><p>CPF/CNPJ: {order.customer.cpfCnpj ?? "Nao informado"}</p><p>Pagamento: {order.paymentMethod === "CASH" ? "Dinheiro" : "PIX"}</p><p>Status do cliente: {orderStatusConfig[order.status].label}</p><p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p><p>Para quando: {formatOrderDesiredDate(order.desiredDate) ?? "Nao informado"}</p>
                </div>
                {order.notes ? <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 px-4 py-3"><p className="text-sm font-medium text-foreground">Observacao do pedido</p><p className="mt-2 text-sm leading-6 text-text-muted">{order.notes}</p></div> : null}
                {!isEditing ? <div className="space-y-2"><label className="block text-sm font-medium text-foreground">Atualizar status</label><Select disabled={isUpdatingStatus} value={order.status} onChange={(event) => void handleStatusChange(event.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status} value={status}>{orderStatusConfig[status].label}</option>)}</Select></div> : null}
              </Card>
              <Card className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Resumo financeiro</h2>
                <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 px-4 py-4"><p className="text-sm text-text-muted">Total do pedido</p><p className="mt-2 text-3xl font-semibold text-accent">{formatPrice(order.totalPrice)}</p></div>
                <div className="grid gap-2 text-sm text-text-muted"><p>Itens no pedido: {order.items.length}</p><p>Quantidade total: {order.items.reduce((total, item) => total + item.quantity, 0)}</p></div>
              </Card>
            </div>
            {isEditing ? (
              <Card>
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Editar pedido</h2>
                    <p className="text-sm text-text-muted">Ajuste os dados operacionais do pedido sem sair da tela de detalhe.</p>
                  </div>
                  <p className="text-sm text-text-muted">Cliente: {order.customer.name}</p>
                </div>
                <form className="mt-6 space-y-6" onSubmit={handleEditSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Data desejada</span><Input type="date" value={editForm.desiredDate} onChange={(event) => updateEditField("desiredDate", event.target.value)} /></label>
                    <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Status</span><Select value={editForm.status} onChange={(event) => updateEditField("status", event.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status} value={status}>{orderStatusConfig[status].label}</option>)}</Select></label>
                    <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Recebimento</span><Select value={editForm.deliveryMethod} onChange={(event) => updateEditField("deliveryMethod", event.target.value as DeliveryMethod)}><option value="DELIVERY">Entrega</option><option value="PICKUP">Retirada</option></Select></label>
                  </div>
                  {editForm.deliveryMethod === "DELIVERY" ? <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Endereco</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">CEP</span><Input inputMode="numeric" placeholder="09750-000" value={editForm.zipCode} onChange={(event) => { const nextZipCode = formatZipCode(event.target.value); updateEditField("zipCode", nextZipCode); if (nextZipCode.replace(/\D/g, "").length < 8) setLastFetchedZipCode(""); }} /></label>
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Numero</span><Input placeholder="123" value={editForm.addressNumber} onChange={(event) => updateEditField("addressNumber", event.target.value)} /></label>
                      <label className="block space-y-2 md:col-span-2"><span className="text-sm font-medium text-foreground">Rua</span><Input placeholder="Rua" value={editForm.street} onChange={(event) => updateEditField("street", event.target.value)} /></label>
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Bairro</span><Input placeholder="Bairro" value={editForm.neighborhood} onChange={(event) => updateEditField("neighborhood", event.target.value)} /></label>
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Complemento</span><Input placeholder="Apto, bloco, referencia" value={editForm.addressComplement} onChange={(event) => updateEditField("addressComplement", event.target.value)} /></label>
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Cidade</span><Input placeholder="Cidade" value={editForm.city} onChange={(event) => updateEditField("city", event.target.value)} /></label>
                      <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Estado</span><Input maxLength={2} placeholder="SP" value={editForm.state} onChange={(event) => updateEditField("state", event.target.value.toUpperCase())} /></label>
                    </div>
                    {isLoadingAddress ? <p className="mt-3 text-sm text-text-muted">Buscando endereco pelo CEP...</p> : null}
                  </div> : <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4"><h3 className="text-sm font-semibold text-foreground">Retirada</h3><p className="mt-2 text-sm text-text-muted">Este pedido sera retirado, por isso o endereco nao e necessario.</p></div>}
                  <label className="block space-y-2"><span className="text-sm font-medium text-foreground">Observacoes</span><textarea className="ui-focus min-h-28 w-full rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-4 py-3 text-sm text-text-contrast placeholder:text-[#7f6454] shadow-soft" placeholder="Ex.: entregar apos as 15h" value={editForm.notes} onChange={(event) => updateEditField("notes", event.target.value)} /></label>
                  <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                    <p className="text-sm font-semibold text-foreground">Preview da atualizacao</p>
                    <div className="mt-3 grid gap-2 text-sm text-text-muted">
                      <p>Status: {orderStatusConfig[editForm.status].label}</p>
                      <p>Recebimento: {formatDeliveryMethodLabel(editForm.deliveryMethod)}</p>
                      <p>Para quando: {formatOrderDesiredDate(editForm.desiredDate) ?? "Nao informado"}</p>
                      <p>Endereco: {editForm.deliveryMethod === "PICKUP" ? "Retirada" : formatOrderAddress({ zipCode: editForm.zipCode, street: editForm.street, neighborhood: editForm.neighborhood, city: editForm.city, state: editForm.state, addressNumber: editForm.addressNumber, addressComplement: editForm.addressComplement }) ?? "Nao informado"}</p>
                      <p>CEP: {editForm.deliveryMethod === "PICKUP" ? "Nao se aplica" : formatZipCode(editForm.zipCode) || "Nao informado"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={isSavingEdit || isLoadingAddress} type="submit" variant="primary">{isSavingEdit ? "Salvando..." : "Salvar alteracoes"}</Button>
                    <Button disabled={isSavingEdit} type="button" variant="secondary" onClick={handleCancelEdit}>Cancelar</Button>
                  </div>
                </form>
              </Card>
            ) : (
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-foreground">Endereco e entrega</h2>
                  <Button type="button" variant="secondary" onClick={handleStartEdit}>Editar pedido</Button>
                </div>
                <div className="grid gap-3 text-sm text-text-muted md:grid-cols-2">
                  <p>Recebimento: {formatDeliveryMethodLabel(order.deliveryMethod)}</p>
                  {order.deliveryMethod === "PICKUP" ? (
                    <p>Endereco: Nao se aplica. Pedido para retirada.</p>
                  ) : (
                    <>
                      <p>CEP: {formatZipCode(order.zipCode) || "Nao informado"}</p>
                      <p>Endereco completo: {formatOrderAddress(order) ?? "Nao informado"}</p>
                      <p>Rua: {order.street ?? "Nao informado"}</p>
                      <p>Numero: {order.addressNumber ?? "Nao informado"}</p>
                      <p>Bairro: {order.neighborhood ?? "Nao informado"}</p>
                      <p>Cidade/UF: {order.city || order.state ? `${order.city ?? ""}${order.state ? `/${order.state}` : ""}` : "Nao informado"}</p>
                      <p>Complemento: {order.addressComplement ?? "Nao informado"}</p>
                    </>
                  )}
                </div>
              </Card>
            )}
            <Card className="space-y-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div><h2 className="text-xl font-semibold text-foreground">Historico do cliente</h2><p className="text-sm text-text-muted">Veja os pedidos deste cliente para dar contexto ao atendimento e a operacao.</p></div>
                <p className="text-sm text-text-muted">{order.customerHistory.length} {order.customerHistory.length === 1 ? "pedido encontrado" : "pedidos encontrados"}</p>
              </div>
              {!hasPreviousOrders ? <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/60 px-4 py-5 text-sm text-text-muted">Este e o primeiro pedido deste cliente.</div> : null}
              <div className="grid gap-3">
                {order.customerHistory.map((historyOrder) => (
                  <div key={historyOrder.id} className={`rounded-[var(--radius-control)] border px-4 py-4 ${historyOrder.isCurrentOrder ? "border-border-strong bg-background/30" : "border-border-soft bg-surface-muted/60"}`.trim()}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">Pedido {historyOrder.id}</p>
                          <StatusBadge status={historyOrder.status} />
                          {historyOrder.isCurrentOrder ? <span className="inline-flex items-center rounded-full border border-border-strong bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pedido atual</span> : null}
                        </div>
                        <div className="grid gap-2 text-sm text-text-muted md:grid-cols-2 xl:grid-cols-3">
                          <p>Data: {formatDate(historyOrder.createdAt)}</p><p>Total: {formatPrice(historyOrder.totalPrice)}</p><p>Para quando: {formatOrderDesiredDate(historyOrder.desiredDate) ?? "Nao informado"}</p>
                        </div>
                        <p className="text-sm leading-6 text-text-muted">Itens: {summarizeHistoryItems(historyOrder.items)}</p>
                      </div>
                      {historyOrder.isCurrentOrder ? <span className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground">Pedido aberto</span> : <Link className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={`/admin/pedidos/${historyOrder.id}`}>Ver pedido</Link>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_360px]">
              <Card>
                <h2 className="text-xl font-semibold text-foreground">Itens do pedido</h2>
                <div className="mt-4 grid gap-3">
                  {order.items.map((item) => {
                    const subtotal = item.price * item.quantity;
                    return (
                      <div key={item.id} className="rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div><h3 className="text-base font-semibold text-foreground">{item.product.name}</h3><p className="mt-1 text-sm text-text-muted">Produto: {item.product.id}</p></div>
                          <div className="text-left text-sm text-text-muted sm:text-right"><p>Quantidade: {item.quantity}</p><p>Preco unitario: {formatPrice(item.price)}</p><p className="font-medium text-foreground">Subtotal: {formatPrice(subtotal)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Acoes rapidas</h2>
                <div className="grid gap-2">
                  {whatsappTemplates.map((template) => (
                    <Button key={template.status} disabled={!normalizedPhone} type="button" variant={selectedTemplate === template.status ? "primary" : "secondary"} onClick={() => { if (!order) return; const nextMessage = buildWhatsAppOrderMessage(order, template.status); const nextUrl = buildWhatsAppLink(order.customer.phone, nextMessage); setSelectedTemplate(template.status); openWhatsApp(nextUrl); }}>
                      {template.label}
                    </Button>
                  ))}
                </div>
                <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                  <p className="text-sm font-medium text-foreground">Preview da mensagem</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-accent">Template selecionado: {orderStatusConfig[selectedTemplate].label}</p>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-muted">{whatsappMessage}</pre>
                </div>
                <Button disabled={!whatsappUrl} fullWidth type="button" variant="primary" onClick={() => openWhatsApp(whatsappUrl)}>Abrir template selecionado</Button>
                {!normalizedPhone ? <p className="text-sm text-text-muted">O botao sera habilitado quando houver um telefone valido.</p> : <p className="text-sm text-text-muted">Numero utilizado: +{normalizedPhone}</p>}
              </Card>
            </div>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
