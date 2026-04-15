"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import {
  formatDeliveryMethodLabel,
  formatOrderAddress,
  formatOrderDesiredDate,
  formatZipCode,
  type DeliveryMethod,
} from "@/lib/order-formatters";
import { hasPixKeyConfigured, pixConfig } from "@/lib/payment-config";
import { buildPixPayload } from "@/lib/pix";
import { buildPublicWhatsAppUrl } from "@/lib/public-whatsapp";

type Product = { id: string; name: string; price: number; active: boolean; stockQuantity: number; createdAt: string };
type ProductQuantityMap = Record<string, number>;
type OrderResponse = {
  id: string;
  status: string;
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
};
type ApiError = { error?: string };
type ViaCepResponse = { cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };

const successFeedbackMessage = "Pedido enviado com sucesso!\n\nJa vamos preparar tudo e te chamar com as proximas atualizacoes.";
const publicWhatsAppMessage = "Ola! Gostaria de saber mais sobre os dadinhos.";

function safeBuildPixPayload(order: OrderResponse | null) {
  if (!hasPixKeyConfigured()) {
    return "";
  }

  try {
    if (order) {
      return buildPixPayload({
        pixKey: pixConfig.key,
        amount: order.totalPrice,
        description: `Pedido ${order.id}`,
        txid: order.id.replace(/-/g, "").slice(0, 25),
      });
    }

    return buildPixPayload({
      pixKey: pixConfig.key,
      description: "Dadinhos da Giu",
      txid: "DADINHOSGIU",
    });
  } catch {
    try {
      return buildPixPayload({
        pixKey: pixConfig.key,
        description: "Dadinhos da Giu",
        txid: "DADINHOSGIU",
      });
    } catch {
      return "";
    }
  }
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function createInitialFormState() {
  return {
    quantities: {} as ProductQuantityMap,
    customerName: "",
    customerPhone: "",
    deliveryMethod: "DELIVERY" as DeliveryMethod,
    desiredDate: "",
    zipCode: "",
    street: "",
    neighborhood: "",
    city: "",
    state: "",
    addressNumber: "",
    addressComplement: "",
    orderNotes: "",
  };
}

export function PublicOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [formState, setFormState] = useState(createInitialFormState);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successOrder, setSuccessOrder] = useState<OrderResponse | null>(null);
  const [pixCopyFeedback, setPixCopyFeedback] = useState("");

  useEffect(() => {
    async function loadProducts() {
      try {
        setErrorMessage("");
        const response = await fetch("/api/produtos", { cache: "no-store" });
        if (!response.ok) throw new Error("Nao foi possivel carregar os produtos.");
        const data = (await response.json()) as Product[];
        setProducts(data.filter((product) => product.active));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel carregar os produtos.");
      } finally {
        setIsLoadingProducts(false);
      }
    }
    void loadProducts();
  }, []);

  useEffect(() => {
    if (!pixCopyFeedback) return;
    const timeout = window.setTimeout(() => setPixCopyFeedback(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [pixCopyFeedback]);

  useEffect(() => {
    if (formState.deliveryMethod === "PICKUP") {
      setIsLoadingAddress(false);
      return;
    }
    const digits = formState.zipCode.replace(/\D/g, "");
    if (digits.length !== 8) {
      if (digits.length < 8) {
        setFormState((current) => ({ ...current, street: "", neighborhood: "", city: "", state: "" }));
      }
      setIsLoadingAddress(false);
      return;
    }
    async function loadAddress() {
      try {
        setIsLoadingAddress(true);
        setErrorMessage("");
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (!response.ok) throw new Error("Nao foi possivel buscar o CEP.");
        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) throw new Error("CEP nao encontrado.");
        setFormState((current) => ({
          ...current,
          street: data.logradouro ?? "",
          neighborhood: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        }));
      } catch (error) {
        setFormState((current) => ({ ...current, street: "", neighborhood: "", city: "", state: "" }));
        setErrorMessage(error instanceof Error ? error.message : "CEP invalido.");
      } finally {
        setIsLoadingAddress(false);
      }
    }
    void loadAddress();
  }, [formState.deliveryMethod, formState.zipCode]);

  const selectedItems = useMemo(() => products.map((product) => ({ product, quantity: formState.quantities[product.id] ?? 0 })).filter((item) => item.quantity > 0), [formState.quantities, products]);
  const visualTotal = useMemo(() => selectedItems.reduce((total, item) => total + item.product.price * item.quantity, 0), [selectedItems]);
  const pickupWhatsAppUrl = useMemo(() => {
    const itemsSummary = selectedItems.map((item) => `${item.product.name} x${item.quantity}`).join(", ");
    const desiredDate = formState.desiredDate ? ` Data desejada: ${formatOrderDesiredDate(formState.desiredDate)}.` : "";
    return buildPublicWhatsAppUrl(`Ola! Fiz um pedido para retirada.${desiredDate} Pedido: ${itemsSummary}.`);
  }, [formState.desiredDate, selectedItems]);
  const paymentWhatsAppUrl = useMemo(() => {
    if (!successOrder) return buildPublicWhatsAppUrl(publicWhatsAppMessage);
    const contextMessage = successOrder.deliveryMethod === "PICKUP"
      ? "Quando eu fizer o PIX, envio o comprovante para combinarmos a retirada."
      : "Quando eu fizer o PIX, envio o comprovante por aqui para seguirmos com a entrega.";
    return buildPublicWhatsAppUrl(`Ola! Acabei de fazer o pedido ${successOrder.id} no valor de ${formatPrice(successOrder.totalPrice)}. ${contextMessage}`);
  }, [successOrder]);
  const pixPayload = useMemo(() => {
    return safeBuildPixPayload(successOrder);
  }, [successOrder]);

  function updateField<Field extends keyof ReturnType<typeof createInitialFormState>>(field: Field, value: ReturnType<typeof createInitialFormState>[Field]) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setFormState((current) => ({ ...current, quantities: { ...current.quantities, [productId]: Math.max(0, nextQuantity) } }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || successMessage) return;

    setErrorMessage("");
    setSuccessMessage("");
    setSuccessOrder(null);
    setPixCopyFeedback("");

    const trimmedName = formState.customerName.trim();
    const trimmedPhone = formState.customerPhone.trim();
    const trimmedDesiredDate = formState.desiredDate.trim();
    const formattedZipCode = formatZipCode(formState.zipCode);
    const trimmedNotes = formState.orderNotes.trim();
    const trimmedStreet = formState.street.trim();
    const trimmedNeighborhood = formState.neighborhood.trim();
    const trimmedCity = formState.city.trim();
    const trimmedState = formState.state.trim();
    const trimmedAddressNumber = formState.addressNumber.trim();
    const trimmedAddressComplement = formState.addressComplement.trim();

    if (!trimmedName) return setErrorMessage("Informe seu nome.");
    if (!trimmedPhone) return setErrorMessage("Informe seu telefone.");
    if (!trimmedDesiredDate) return setErrorMessage("Informe para quando voce quer seu dadinho.");
    if (selectedItems.length === 0) return setErrorMessage("Selecione ao menos um produto.");

    if (formState.deliveryMethod === "DELIVERY") {
      if (!formattedZipCode || formattedZipCode.replace(/\D/g, "").length !== 8) {
        return setErrorMessage("Informe um CEP valido.");
      }
      if (!trimmedStreet || !trimmedNeighborhood || !trimmedCity || !trimmedState) {
        return setErrorMessage("Preencha um CEP valido para carregar o endereco.");
      }
      if (!trimmedAddressNumber) return setErrorMessage("Informe o numero do endereco.");
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: trimmedName, phone: trimmedPhone },
          deliveryMethod: formState.deliveryMethod,
          desiredDate: trimmedDesiredDate,
          ...(formState.deliveryMethod === "DELIVERY"
            ? {
                zipCode: formattedZipCode,
                street: trimmedStreet,
                neighborhood: trimmedNeighborhood,
                city: trimmedCity,
                state: trimmedState,
                addressNumber: trimmedAddressNumber,
              }
            : {}),
          ...(formState.deliveryMethod === "DELIVERY" && trimmedAddressComplement ? { addressComplement: trimmedAddressComplement } : {}),
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          items: selectedItems.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        }),
      });

      const data = (await response.json()) as OrderResponse | ApiError;
      if (!response.ok) {
        setErrorMessage("error" in data ? data.error ?? "Nao foi possivel enviar o pedido." : "Nao foi possivel enviar o pedido.");
        return;
      }

      const nextOrder = data as OrderResponse;

      setProducts((current) =>
        current.map((product) => {
          const selectedItem = selectedItems.find((item) => item.product.id === product.id);
          if (!selectedItem) return product;
          return { ...product, stockQuantity: Math.max(0, product.stockQuantity - selectedItem.quantity) };
        }),
      );
      setFormState(createInitialFormState());
      setSuccessOrder(nextOrder);
      setSuccessMessage(successFeedbackMessage);
    } catch {
      setErrorMessage("Nao foi possivel enviar o pedido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyPixKey() {
    if (!hasPixKeyConfigured()) {
      setPixCopyFeedback("Chave PIX indisponivel no momento.");
      return;
    }
    try {
      await navigator.clipboard.writeText(pixConfig.key);
      setPixCopyFeedback("Chave PIX copiada com sucesso.");
    } catch {
      setPixCopyFeedback("Nao foi possivel copiar a chave PIX.");
    }
  }

  async function handleCopyPixPayload() {
    if (!pixPayload) {
      setPixCopyFeedback("Codigo PIX indisponivel no momento.");
      return;
    }

    try {
      await navigator.clipboard.writeText(pixPayload);
      setPixCopyFeedback("Codigo PIX copiado com sucesso.");
    } catch {
      setPixCopyFeedback("Nao foi possivel copiar o codigo PIX.");
    }
  }

  if (successMessage) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer className="flex min-h-[calc(100vh-220px)] items-center justify-center py-10">
          <Card className="w-full max-w-2xl space-y-6 p-6 text-center sm:p-8">
            <PageTitle eyebrow="Pedido recebido" title="Pedido enviado com sucesso!" subtitle="Ja vamos preparar tudo e te chamar com as proximas atualizacoes." />
            {successOrder ? (
              <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4 text-left">
                <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                  <p>Pedido: {successOrder.id}</p>
                  <p>Total: {formatPrice(successOrder.totalPrice)}</p>
                  <p>Recebimento: {formatDeliveryMethodLabel(successOrder.deliveryMethod)}</p>
                  <p>Para quando: {formatOrderDesiredDate(successOrder.desiredDate) ?? "Nao informado"}</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 p-5 text-left">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">Pagamento via PIX</p>
                <p className="text-sm text-text-muted">Voce pode pagar escaneando o QR Code ou copiando a chave PIX.</p>
                <p className="text-sm text-text-muted">Se preferir, voce ja pode realizar o pagamento via PIX e nos enviar o comprovante pelo WhatsApp.</p>
                {successOrder?.deliveryMethod === "PICKUP" ? (
                  <p className="text-sm text-text-muted">Para retirada, o horario pode ser combinado com a Giu pelo WhatsApp depois do pagamento.</p>
                ) : null}
              </div>
              <div className="mt-4 flex justify-center">
                <div className="rounded-[var(--radius-control)] border border-border-soft bg-white p-4 shadow-soft">
                  {pixPayload ? (
                    <QRCodeSVG
                      bgColor="#ffffff"
                      fgColor="#2b1a12"
                      includeMargin
                      level="M"
                      size={192}
                      value={pixPayload}
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center text-center text-sm text-[#2b1a12]">
                      QR Code PIX indisponivel no momento.
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Chave PIX</p>
                <p className="mt-2 break-all text-base font-semibold text-foreground">
                  {hasPixKeyConfigured()
                    ? pixConfig.formattedKey
                    : "Chave PIX ainda nao configurada."}
                </p>
              </div>
              {pixPayload ? (
                <div className="mt-4 rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Codigo PIX
                  </p>
                  <p className="mt-2 break-all text-sm text-text-muted">
                    {pixPayload}
                  </p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button disabled={!hasPixKeyConfigured()} type="button" variant="primary" onClick={() => void handleCopyPixKey()}>
                  Copiar chave PIX
                </Button>
                <Button
                  disabled={!pixPayload}
                  type="button"
                  variant="secondary"
                  onClick={() => void handleCopyPixPayload()}
                >
                  Copiar codigo PIX
                </Button>
              </div>
              <div className="mt-3">
                <a className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={paymentWhatsAppUrl} rel="noreferrer" target="_blank">
                  Enviar comprovante no WhatsApp
                </a>
              </div>
              {pixCopyFeedback ? <p className="mt-3 text-sm text-text-muted">{pixCopyFeedback}</p> : null}
            </div>

            <p className="text-sm text-text-muted">Depois de pagar, voce pode voltar para o inicio ou seguir conversando com a Giu pelo WhatsApp.</p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href="/">
                Voltar para o inicio
              </Link>
              <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-background/25 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={paymentWhatsAppUrl} rel="noreferrer" target="_blank">
                Falar no WhatsApp
              </a>
            </div>
          </Card>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 pb-8">
        <Card className="space-y-4 p-5 sm:p-6">
          <PageTitle eyebrow="Faca seu pedido" title="Monte seu pedido com rapidez e clareza" subtitle="Escolha os produtos, informe seus dados e finalize tudo em poucos passos." />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-accent px-5 py-3 text-sm font-semibold text-text-contrast transition hover:bg-accent-strong" href="/">
              Voltar para o inicio
            </Link>
            <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={buildPublicWhatsAppUrl(publicWhatsAppMessage)} rel="noreferrer" target="_blank">
              Falar no WhatsApp
            </a>
          </div>
          {errorMessage ? <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">{errorMessage}</div> : null}
        </Card>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="space-y-5 p-4 sm:space-y-6 sm:p-6">
            {isLoadingProducts ? <p className="text-sm text-text-muted">Carregando produtos...</p> : null}
            {!isLoadingProducts && products.length === 0 ? <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/70 px-4 py-6 text-sm text-text-muted">Nenhum produto ativo disponivel no momento.</div> : null}
            {products.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Monte seu pedido</p>
                  <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Toque para ajustar</span>
                </div>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  {products.map((product) => {
                    const quantity = formState.quantities[product.id] ?? 0;
                    const isOutOfStock = product.stockQuantity <= 0;
                    return (
                      <Card key={product.id} className={`border-border-strong p-4 sm:p-5 ${isOutOfStock ? "bg-background/20 opacity-80" : "bg-surface-muted"}`.trim()}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <h2 className="text-lg font-semibold">{product.name}</h2>
                            <p className="text-sm text-text-muted">{formatPrice(product.price)}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${isOutOfStock ? "border-amber-300/30 bg-amber-950/30 text-amber-100" : "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"}`.trim()}>
                            {isOutOfStock ? "Sob encomenda" : "Pronta entrega"}
                          </span>
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-3">
                          <Button className="h-12 w-12 rounded-full px-0 py-0 text-lg" disabled={quantity === 0} type="button" variant="secondary" onClick={() => updateQuantity(product.id, quantity - 1)}>
                            -
                          </Button>
                          <span className="min-w-10 text-center text-lg font-semibold">{quantity}</span>
                          <Button className="h-12 w-12 rounded-full px-0 py-0 text-lg" type="button" variant="primary" onClick={() => updateQuantity(product.id, quantity + 1)}>
                            +
                          </Button>
                        </div>
                        <p className="mt-4 text-sm text-text-muted">{isOutOfStock ? "Disponivel sob encomenda." : "Disponivel para pronta entrega."}</p>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="h-fit p-4 sm:p-6 lg:sticky lg:top-6">
            <PageTitle title="Seus dados e resumo" subtitle="Confira os itens selecionados antes de finalizar." />
            <form className="mt-5 space-y-5 sm:mt-6 sm:space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Dados para contato</p>
                  <p className="mt-1 text-sm text-text-muted">Use os dados que vamos usar para confirmar seu pedido.</p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Nome</span>
                  <Input placeholder="Seu nome" value={formState.customerName} onChange={(event) => updateField("customerName", event.target.value)} />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Telefone</span>
                  <Input placeholder="11999999999" value={formState.customerPhone} onChange={(event) => updateField("customerPhone", event.target.value)} />
                </label>
              </div>

              <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Recebimento</p>
                  <p className="mt-1 text-sm text-text-muted">Escolha entre entrega ou retirada antes de finalizar.</p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Como voce quer receber seu pedido?</span>
                  <Select value={formState.deliveryMethod} onChange={(event) => updateField("deliveryMethod", event.target.value as DeliveryMethod)}>
                    <option value="DELIVERY">Entrega</option>
                    <option value="PICKUP">Retirada</option>
                  </Select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Para quando voce quer seu dadinho?</span>
                  <Input type="date" value={formState.desiredDate} onChange={(event) => updateField("desiredDate", event.target.value)} />
                </label>
                {formState.deliveryMethod === "DELIVERY" ? (
                  <>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">CEP</span>
                      <Input inputMode="numeric" placeholder="09750-000" value={formState.zipCode} onChange={(event) => updateField("zipCode", formatZipCode(event.target.value))} />
                    </label>
                    {isLoadingAddress ? <p className="text-sm text-text-muted">Buscando endereco...</p> : null}
                    {formState.street || formState.neighborhood || formState.city || formState.state ? (
                      <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                        <p className="text-sm font-semibold text-foreground">Endereco encontrado</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Input readOnly value={formState.street} />
                          <Input readOnly value={formState.neighborhood} />
                          <Input readOnly value={formState.city} />
                          <Input readOnly value={formState.state} />
                        </div>
                      </div>
                    ) : null}
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">Numero</span>
                      <Input placeholder="123" value={formState.addressNumber} onChange={(event) => updateField("addressNumber", event.target.value)} />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">Complemento</span>
                      <Input placeholder="Apto 12" value={formState.addressComplement} onChange={(event) => updateField("addressComplement", event.target.value)} />
                    </label>
                  </>
                ) : (
                  <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 p-4">
                    <p className="text-sm font-semibold text-foreground">Pedido para retirada</p>
                    <p className="mt-2 text-sm text-text-muted">Vamos preparar seu pedido para retirada. Se quiser, voce ja pode falar com a Giu pelo WhatsApp.</p>
                    <Button className="mt-4" disabled={selectedItems.length === 0} type="button" variant="secondary" onClick={() => window.open(pickupWhatsAppUrl, "_blank", "noopener,noreferrer")}>
                      Combinar retirada no WhatsApp
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Observacao</span>
                  <textarea className="ui-focus min-h-28 w-full rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-4 py-3 text-sm text-text-contrast placeholder:text-[#7f6454] shadow-soft" placeholder="Ex.: Entregar a partir das 15h" value={formState.orderNotes} onChange={(event) => updateField("orderNotes", event.target.value)} />
                </label>
              </div>

              <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                <h3 className="text-sm font-semibold text-foreground">Itens selecionados</h3>
                {selectedItems.length === 0 ? (
                  <p className="mt-3 text-sm text-text-muted">Nenhum item selecionado ainda.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedItems.map((item) => (
                      <div key={item.product.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                          <p className="text-sm text-text-muted">Quantidade: {item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium text-foreground">{formatPrice(item.product.price * item.quantity)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 px-4 py-4">
                <span className="text-sm font-medium text-text-muted">Total estimado</span>
                <span className="text-2xl font-semibold text-accent">{formatPrice(visualTotal)}</span>
              </div>

              {formState.orderNotes.trim() ? (
                <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                  <p className="text-sm font-semibold text-foreground">Observacao do pedido</p>
                  <p className="mt-2 text-sm text-text-muted">{formState.orderNotes.trim()}</p>
                </div>
              ) : null}

              {formState.desiredDate || formState.deliveryMethod === "PICKUP" || formState.street || formState.addressNumber || formState.addressComplement ? (
                <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                  <p className="text-sm font-semibold text-foreground">Recebimento e atendimento</p>
                  <div className="mt-2 space-y-2 text-sm text-text-muted">
                    <p>Como receber: {formatDeliveryMethodLabel(formState.deliveryMethod)}</p>
                    {formState.desiredDate ? <p>Para quando: {formatOrderDesiredDate(formState.desiredDate)}</p> : null}
                    {formState.deliveryMethod === "DELIVERY" && formatOrderAddress({ street: formState.street, neighborhood: formState.neighborhood, city: formState.city, state: formState.state, addressNumber: formState.addressNumber, addressComplement: formState.addressComplement }) ? (
                      <p>Endereco: {formatOrderAddress({ street: formState.street, neighborhood: formState.neighborhood, city: formState.city, state: formState.state, addressNumber: formState.addressNumber, addressComplement: formState.addressComplement })}</p>
                    ) : null}
                    {formState.deliveryMethod === "DELIVERY" && formState.zipCode ? <p>CEP: {formatZipCode(formState.zipCode)}</p> : null}
                    {formState.deliveryMethod === "PICKUP" ? <p>Retirada combinada diretamente com a Giu.</p> : null}
                  </div>
                </div>
              ) : null}

              <Button disabled={isSubmitting || isLoadingProducts || isLoadingAddress} fullWidth type="submit" variant="primary" className="min-h-13 text-base">
                {isSubmitting ? "Enviando pedido..." : "Finalizar pedido"}
              </Button>
            </form>
          </Card>
        </div>
      </PageContainer>
    </main>
  );
}
