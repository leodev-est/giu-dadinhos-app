"use client";

import Link from "next/link";
import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";
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
import { paymentStatusConfig, type PaymentStatus } from "@/lib/payment-status";
import { buildPublicWhatsAppUrl } from "@/lib/public-whatsapp";
import { calculateBulkLineTotal, hasBulkPromotion } from "@/lib/bulk-pricing";

type Product = { id: string; name: string; price: number; active: boolean; stockQuantity: number; bulkMinQty: number | null; bulkPrice: number | null; createdAt: string };
type ProductQuantityMap = Record<string, number>;
type PaymentMethod = "PIX" | "CASH";
type OrderResponse = {
  id: string;
  status: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  totalPrice: number;
  deliveryFee?: number | null;
  couponDiscount?: number | null;
  desiredDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  notes?: string | null;
  payment?: {
    status: PaymentStatus;
    paidAt?: string | null;
    receiptNote?: string | null;
  } | null;
};
type ApiError = { error?: string };
type ViaCepResponse = { cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };

const successFeedbackMessage = "Pedido enviado com sucesso!\n\nJa vamos preparar tudo e te chamar com as proximas atualizacoes.";
const cashSuccessFeedbackMessage = "Pedido realizado com sucesso!\n\nJa vamos preparar tudo e te chamar com as proximas atualizacoes.";
const publicWhatsAppMessage = "Ola! Gostaria de saber mais sobre os dadinhos.";

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function createInitialFormState() {
  return {
    quantities: {} as ProductQuantityMap,
    customerName: "",
    customerPhone: "",
    paymentMethod: "PIX" as PaymentMethod,
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
    couponCode: "",
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
  const [deliveryFee, setDeliveryFee] = useState(0);

  useEffect(() => {
    async function loadProducts() {
      try {
        setErrorMessage("");
        const [prodRes, cfgRes] = await Promise.all([
          fetch("/api/produtos", { cache: "no-store" }),
          fetch("/api/configuracoes", { cache: "no-store" }),
        ]);
        if (!prodRes.ok) throw new Error("Nao foi possivel carregar os produtos.");
        const data = (await prodRes.json()) as Product[];
        setProducts(data.filter((product) => product.active));
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as Record<string, string>;
          const fee = parseFloat(cfg.deliveryFee ?? "0");
          if (!isNaN(fee) && fee > 0) setDeliveryFee(fee);
        }
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
  const subtotal = useMemo(() => selectedItems.reduce((total, item) => {
    const rule = { bulkMinQty: item.product.bulkMinQty, bulkPrice: item.product.bulkPrice };
    return total + calculateBulkLineTotal(item.product.price, item.quantity, rule);
  }, 0), [selectedItems]);
  const visualDeliveryFee = formState.deliveryMethod === "DELIVERY" ? deliveryFee : 0;
  const visualTotal = subtotal + visualDeliveryFee;
  const paymentWhatsAppUrl = useMemo(() => {
    if (!successOrder) return buildPublicWhatsAppUrl(publicWhatsAppMessage);
    const contextMessage = successOrder.deliveryMethod === "PICKUP"
      ? "Ja fiz o PIX e envio o comprovante por aqui para combinarmos a retirada."
      : "Ja fiz o PIX e envio o comprovante por aqui para seguirmos com a entrega.";
    return buildPublicWhatsAppUrl(`Ola! Acabei de fazer o pedido ${successOrder.id} no valor de ${formatPrice(successOrder.totalPrice)}. ${contextMessage}`);
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
          paymentMethod: formState.paymentMethod,
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
          ...(formState.couponCode.trim() ? { couponCode: formState.couponCode.trim() } : {}),
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
      setSuccessMessage(
        nextOrder.paymentMethod === "CASH"
          ? cashSuccessFeedbackMessage
          : successFeedbackMessage,
      );
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

            {successOrder?.paymentMethod === "PIX" ? (
            <div className="rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 p-5 text-left">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">Pagamento via PIX</p>
                <p className="text-sm text-text-muted">Use a chave PIX da Giu abaixo para fazer o pagamento.</p>
                <p className="text-sm text-text-muted">Depois de pagar, envie o comprovante pelo WhatsApp para confirmarmos o pedido.</p>
                {successOrder?.deliveryMethod === "PICKUP" ? (
                  <p className="text-sm text-text-muted">Para retirada, o horario pode ser combinado com a Giu pelo WhatsApp depois do pagamento.</p>
                ) : null}
              </div>
              <div className="mt-4 rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                {successOrder?.payment ? (
                  <p className="mb-3 text-sm text-text-muted">
                    Status do pagamento:{" "}
                    {paymentStatusConfig[successOrder.payment.status].label}
                  </p>
                ) : null}
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Chave PIX</p>
                <p className="mt-2 break-all text-base font-semibold text-foreground">
                  {hasPixKeyConfigured()
                    ? pixConfig.formattedKey
                    : "Chave PIX ainda nao configurada."}
                </p>
              </div>
              <div className="mt-4">
                <Button disabled={!hasPixKeyConfigured()} fullWidth type="button" variant="primary" onClick={() => void handleCopyPixKey()}>
                  Copiar chave PIX
                </Button>
              </div>
              <div className="mt-3">
                <a className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={paymentWhatsAppUrl} rel="noreferrer" target="_blank">
                  Enviar comprovante no WhatsApp
                </a>
              </div>
              {pixCopyFeedback ? <p className="mt-3 text-sm text-text-muted">{pixCopyFeedback}</p> : null}
            </div>
            ) : (
              <div className="rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 p-5 text-left">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-foreground">Pagamento em dinheiro</p>
                  <p className="text-sm text-text-muted">
                    Seu pedido foi registrado com pagamento em dinheiro.
                  </p>
                  <p className="text-sm text-text-muted">
                    Vamos combinar os detalhes finais da entrega ou retirada com voce.
                  </p>
                </div>
              </div>
            )}

            <p className="text-sm text-text-muted">
              {successOrder?.paymentMethod === "PIX"
                ? "Depois de pagar, voce pode voltar para o inicio ou seguir conversando com a Giu pelo WhatsApp."
                : "Agora voce pode voltar para o inicio ou fazer outro pedido."}
            </p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href="/">
                Voltar para o inicio
              </Link>
              {successOrder?.paymentMethod === "PIX" ? (
                <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-background/25 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href={paymentWhatsAppUrl} rel="noreferrer" target="_blank">
                  Falar no WhatsApp
                </a>
              ) : (
                <Link className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-background/25 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted" href="/pedido">
                  Fazer outro pedido
                </Link>
              )}
            </div>
          </Card>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 pb-8">
        <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-border-soft bg-[#563725] shadow-soft">
          <Image
            alt="Dadinhos de tapioca dourados da Giu"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            src="/dadinhos-hero.png"
          />
          <div className="absolute inset-0 bg-[#2b1a12]/55" />
          <div className="relative max-w-3xl space-y-4 p-5 sm:p-8">
            <PageTitle eyebrow="Faca seu pedido" title="Monte seu pedido com rapidez e clareza" subtitle="Escolha os produtos, informe seus dados e finalize tudo em poucos passos." />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-accent px-5 py-3 text-sm font-semibold text-text-contrast transition hover:bg-accent-strong" href="/">
                Voltar para o inicio
              </Link>
              <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-[#f5e6d3]/35 bg-[#f5e6d3]/12 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-[#f5e6d3]/18" href={buildPublicWhatsAppUrl(publicWhatsAppMessage)} rel="noreferrer" target="_blank">
                Falar no WhatsApp
              </a>
            </div>
            {errorMessage ? <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/70 px-4 py-3 text-sm text-red-100">{errorMessage}</div> : null}
          </div>
        </section>

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
                      <article key={product.id} className={`rounded-[var(--radius-card)] border border-border-strong p-4 shadow-soft sm:p-5 ${isOutOfStock ? "bg-background/20 opacity-80" : "bg-surface-muted"}`.trim()}>
                        <div className="relative mb-4 h-32 overflow-hidden rounded-[var(--radius-control)] border border-border-soft bg-background/20">
                          <Image
                            alt=""
                            className="h-32 w-full object-cover"
                            fill
                            sizes="(max-width: 768px) 100vw, 360px"
                            src="/dadinhos-hero.png"
                          />
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <h2 className="text-lg font-semibold">{product.name}</h2>
                            <p className="text-sm text-text-muted">{formatPrice(product.price)} cada</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${isOutOfStock ? "border-amber-300/30 bg-amber-950/30 text-amber-100" : "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"}`.trim()}>
                            {isOutOfStock ? "Sob encomenda" : "Pronta entrega"}
                          </span>
                        </div>
                        {product.bulkMinQty !== null && product.bulkPrice !== null ? (
                          <div className="mt-3 rounded-[var(--radius-control)] border border-amber-300/30 bg-amber-950/30 px-3 py-2">
                            <p className="text-xs font-semibold text-amber-100">
                              Promocao: {product.bulkMinQty} por {formatPrice(product.bulkPrice)} (economize {formatPrice(product.price * product.bulkMinQty - product.bulkPrice)})
                            </p>
                          </div>
                        ) : null}
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
                      </article>
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
                  <p className="text-sm font-semibold text-foreground">Pagamento</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Escolha se quer pagar com PIX agora ou em dinheiro no atendimento.
                  </p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Como voce quer pagar?</span>
                  <Select
                    value={formState.paymentMethod}
                    onChange={(event) => updateField("paymentMethod", event.target.value as PaymentMethod)}
                  >
                    <option value="PIX">PIX</option>
                    <option value="CASH">Dinheiro</option>
                  </Select>
                </label>
                {formState.paymentMethod === "PIX" ? (
                  <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 p-4">
                    <p className="text-sm font-semibold text-foreground">Pagamento via PIX</p>
                    <p className="mt-2 text-sm text-text-muted">
                      Depois de finalizar, a chave PIX da Giu aparece na tela com um botao para copiar.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 p-4">
                    <p className="text-sm font-semibold text-foreground">Pagamento em dinheiro</p>
                    <p className="mt-2 text-sm text-text-muted">
                      O pedido sera registrado direto, sem etapa de PIX.
                    </p>
                  </div>
                )}
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
                    <p className="mt-2 text-sm text-text-muted">Depois que o pedido for finalizado, a Giu combina o melhor horario de retirada pelo WhatsApp.</p>
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
                    {selectedItems.map((item) => {
                      const rule = { bulkMinQty: item.product.bulkMinQty, bulkPrice: item.product.bulkPrice };
                      const lineTotal = calculateBulkLineTotal(item.product.price, item.quantity, rule);
                      const promoAtiva = hasBulkPromotion(item.quantity, rule);
                      return (
                        <div key={item.product.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                            <p className="text-sm text-text-muted">Quantidade: {item.quantity}</p>
                            {promoAtiva ? (
                              <p className="text-xs font-semibold text-amber-300">Promocao aplicada</p>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium text-foreground">{formatPrice(lineTotal)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Cupom de desconto (opcional)</span>
                  <Input
                    placeholder="Ex.: PROMO10"
                    value={formState.couponCode}
                    onChange={(e) => updateField("couponCode", e.target.value.toUpperCase())}
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 px-4 py-4">
                {visualDeliveryFee > 0 && (
                  <div className="flex items-center justify-between text-sm text-text-muted">
                    <span>Taxa de entrega</span>
                    <span>{formatPrice(visualDeliveryFee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-muted">Total estimado</span>
                  <span className="text-2xl font-semibold text-accent">{formatPrice(visualTotal)}</span>
                </div>
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
