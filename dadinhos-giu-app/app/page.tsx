"use client";

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
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Select } from "@/components/ui/select";
import {
  buildPickupWhatsAppMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp-order-message";

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stockQuantity: number;
  createdAt: string;
};

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

type ApiError = {
  error?: string;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type SavedCustomerOrderData = {
  customerName: string;
  customerPhone: string;
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  addressNumber: string;
  addressComplement: string;
};

const customerOrderStorageKey = "dadinhos-giu:customer-order-data";
const giuWhatsAppPhone = process.env.NEXT_PUBLIC_GIU_WHATSAPP_PHONE ?? "";

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<ProductQuantityMap>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("DELIVERY");
  const [desiredDate, setDesiredDate] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [street, setStreet] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [hasRecoveredCustomerData, setHasRecoveredCustomerData] =
    useState(false);
  const [hasLoadedStoredCustomerData, setHasLoadedStoredCustomerData] =
    useState(false);

  async function loadProducts() {
    try {
      setErrorMessage("");

      const response = await fetch("/api/produtos", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Nao foi possivel carregar os produtos.");
      }

      const data = (await response.json()) as Product[];
      setProducts(data.filter((product) => product.active));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar os produtos.",
      );
    } finally {
      setIsLoadingProducts(false);
    }
  }

  useEffect(() => {
    try {
      const rawSavedData = window.localStorage.getItem(customerOrderStorageKey);

      if (!rawSavedData) {
        return;
      }

      const savedData = JSON.parse(rawSavedData) as Partial<SavedCustomerOrderData>;

      setCustomerName(savedData.customerName ?? "");
      setCustomerPhone(savedData.customerPhone ?? "");
      setZipCode(formatZipCode(savedData.zipCode ?? ""));
      setStreet(savedData.street ?? "");
      setNeighborhood(savedData.neighborhood ?? "");
      setCity(savedData.city ?? "");
      setState(savedData.state ?? "");
      setAddressNumber(savedData.addressNumber ?? "");
      setAddressComplement(savedData.addressComplement ?? "");
      setHasRecoveredCustomerData(true);
    } catch {
      window.localStorage.removeItem(customerOrderStorageKey);
    } finally {
      setHasLoadedStoredCustomerData(true);
    }
  }, []);

  useEffect(() => {
    if (deliveryMethod === "PICKUP") {
      setIsLoadingAddress(false);
      return;
    }

    const digits = zipCode.replace(/\D/g, "");

    if (digits.length !== 8) {
      if (digits.length < 8) {
        setStreet("");
        setNeighborhood("");
        setCity("");
        setState("");
      }
      setIsLoadingAddress(false);
      return;
    }

    async function loadAddress() {
      try {
        setIsLoadingAddress(true);
        setErrorMessage("");

        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);

        if (!response.ok) {
          throw new Error("Nao foi possivel buscar o CEP.");
        }

        const data = (await response.json()) as ViaCepResponse;

        if (data.erro) {
          throw new Error("CEP nao encontrado.");
        }

        setStreet(data.logradouro ?? "");
        setNeighborhood(data.bairro ?? "");
        setCity(data.localidade ?? "");
        setState(data.uf ?? "");
      } catch (error) {
        setStreet("");
        setNeighborhood("");
        setCity("");
        setState("");
        setErrorMessage(
          error instanceof Error ? error.message : "CEP invalido.",
        );
      } finally {
        setIsLoadingAddress(false);
      }
    }

    void loadAddress();
  }, [deliveryMethod, zipCode]);

  useEffect(() => {
    void loadProducts();
  }, []);

  const selectedItems = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          quantity: quantities[product.id] ?? 0,
        }))
        .filter((item) => item.quantity > 0),
    [products, quantities],
  );

  const visualTotal = useMemo(
    () =>
      selectedItems.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0,
      ),
    [selectedItems],
  );

  const pickupWhatsAppMessage = useMemo(
    () =>
      buildPickupWhatsAppMessage({
        customerName,
        desiredDate,
        items: selectedItems.map((item) => ({
          quantity: item.quantity,
          productName: item.product.name,
        })),
      }),
    [customerName, desiredDate, selectedItems],
  );

  const pickupWhatsAppUrl = useMemo(
    () => buildWhatsAppLink(giuWhatsAppPhone, pickupWhatsAppMessage),
    [pickupWhatsAppMessage],
  );

  function updateQuantity(productId: string, nextQuantity: number) {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, nextQuantity),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    const trimmedDesiredDate = desiredDate.trim();
    const formattedZipCode = formatZipCode(zipCode);
    const trimmedNotes = orderNotes.trim();
    const trimmedStreet = street.trim();
    const trimmedNeighborhood = neighborhood.trim();
    const trimmedCity = city.trim();
    const trimmedState = state.trim();
    const trimmedAddressNumber = addressNumber.trim();
    const trimmedAddressComplement = addressComplement.trim();

    if (!trimmedName) {
      setErrorMessage("Informe seu nome.");
      return;
    }

    if (!trimmedPhone) {
      setErrorMessage("Informe seu telefone.");
      return;
    }

    if (!trimmedDesiredDate) {
      setErrorMessage("Informe para quando voce quer seu dadinho.");
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMessage("Selecione ao menos um produto.");
      return;
    }

    if (deliveryMethod === "DELIVERY") {
      if (!formattedZipCode || formattedZipCode.replace(/\D/g, "").length !== 8) {
        setErrorMessage("Informe um CEP valido.");
        return;
      }

      if (!trimmedStreet || !trimmedNeighborhood || !trimmedCity || !trimmedState) {
        setErrorMessage("Preencha um CEP valido para carregar o endereco.");
        return;
      }

      if (!trimmedAddressNumber) {
        setErrorMessage("Informe o numero do endereco.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/pedidos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            name: trimmedName,
            phone: trimmedPhone,
          },
          deliveryMethod,
          desiredDate: trimmedDesiredDate,
          ...(deliveryMethod === "DELIVERY"
            ? {
                zipCode: formattedZipCode,
                street: trimmedStreet,
                neighborhood: trimmedNeighborhood,
                city: trimmedCity,
                state: trimmedState,
                addressNumber: trimmedAddressNumber,
              }
            : {}),
          ...(deliveryMethod === "DELIVERY" && trimmedAddressComplement
            ? { addressComplement: trimmedAddressComplement }
            : {}),
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          items: selectedItems.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = (await response.json()) as OrderResponse | ApiError;

      if (!response.ok) {
        setErrorMessage(
          "error" in data
            ? data.error ?? "Nao foi possivel enviar o pedido."
            : "Nao foi possivel enviar o pedido.",
        );
        return;
      }

      const savedCustomerData: SavedCustomerOrderData = {
        customerName: trimmedName,
        customerPhone: trimmedPhone,
        zipCode: formattedZipCode,
        street: trimmedStreet,
        neighborhood: trimmedNeighborhood,
        city: trimmedCity,
        state: trimmedState,
        addressNumber: trimmedAddressNumber,
        addressComplement: trimmedAddressComplement,
      };

      window.localStorage.setItem(
        customerOrderStorageKey,
        JSON.stringify(savedCustomerData),
      );

      setProducts((current) =>
        current.map((product) => {
          const selectedItem = selectedItems.find(
            (item) => item.product.id === product.id,
          );

          if (!selectedItem) {
            return product;
          }

          return {
            ...product,
            stockQuantity: Math.max(
              0,
              product.stockQuantity - selectedItem.quantity,
            ),
          };
        }),
      );
      setCustomerName("");
      setCustomerPhone("");
      setDeliveryMethod("DELIVERY");
      setDesiredDate("");
      setZipCode("");
      setStreet("");
      setNeighborhood("");
      setCity("");
      setState("");
      setAddressNumber("");
      setAddressComplement("");
      setOrderNotes("");
      setQuantities({});
      setHasRecoveredCustomerData(true);
      setSuccessMessage(
        "Pedido enviado com sucesso! Entraremos em contato pelo WhatsApp com as atualizacoes do seu pedido.",
      );
    } catch {
      setErrorMessage("Nao foi possivel enviar o pedido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="grid gap-4 pb-8 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="space-y-5 p-4 sm:space-y-6 sm:p-6">
          <PageTitle
            eyebrow="Faca seu pedido"
            title="Escolha seus dadinhos favoritos e envie seu pedido em minutos."
            subtitle="Selecione os produtos disponiveis, informe seus dados e finalize diretamente por aqui."
          />

          {errorMessage ? (
            <div className="rounded-[var(--radius-control)] border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-[var(--radius-control)] border border-emerald-300/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
              {successMessage}
            </div>
          ) : null}

          {isLoadingProducts ? (
            <p className="text-sm text-text-muted">Carregando produtos...</p>
          ) : null}

          {!isLoadingProducts && products.length === 0 ? (
            <div className="rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/70 px-4 py-6 text-sm text-text-muted">
              Nenhum produto ativo disponivel no momento.
            </div>
          ) : null}

          {products.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  Monte seu pedido
                </p>
                <span className="rounded-full border border-border-soft bg-background/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Toque para ajustar
                </span>
              </div>

              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {products.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                const isOutOfStock = product.stockQuantity <= 0;

                return (
                  <Card
                    key={product.id}
                    className={`border-border-strong p-4 sm:p-5 ${
                      isOutOfStock
                        ? "bg-background/20 opacity-80"
                        : "bg-surface-muted"
                    }`.trim()}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <h2 className="text-lg font-semibold">{product.name}</h2>
                        <p className="text-sm text-text-muted">
                          {formatPrice(product.price)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          isOutOfStock
                            ? "border-amber-300/30 bg-amber-950/30 text-amber-100"
                            : "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"
                        }`.trim()}
                      >
                        {isOutOfStock
                          ? "Sob encomenda"
                          : "Pronta entrega"}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <Button
                        className="h-12 w-12 rounded-full px-0 py-0 text-lg"
                        disabled={quantity === 0}
                        type="button"
                        variant="secondary"
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                      >
                        -
                      </Button>
                      <span className="min-w-10 text-center text-lg font-semibold">
                        {quantity}
                      </span>
                      <Button
                        className="h-12 w-12 rounded-full px-0 py-0 text-lg"
                        type="button"
                        variant="primary"
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                      >
                        +
                      </Button>
                    </div>

                    <p className="mt-4 text-sm text-text-muted">
                      {isOutOfStock
                        ? "Disponivel sob encomenda."
                        : "Disponivel para pronta entrega."}
                    </p>
                  </Card>
                );
              })}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="h-fit p-4 sm:p-6 lg:sticky lg:top-6">
          <PageTitle
            title="Seus dados e resumo"
            subtitle="Confira os itens selecionados antes de finalizar."
          />

          <form className="mt-5 space-y-5 sm:mt-6 sm:space-y-6" onSubmit={handleSubmit}>
            {hasLoadedStoredCustomerData && hasRecoveredCustomerData ? (
              <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 px-4 py-3 text-sm text-text-muted">
                Preenchemos seus dados do ultimo pedido. Se quiser, voce pode alterar tudo normalmente.
              </div>
            ) : null}

            <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Dados para contato
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Use os dados que vamos usar para confirmar seu pedido.
                </p>
              </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Nome</span>
              <Input
                placeholder="Seu nome"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Telefone
              </span>
              <Input
                placeholder="11999999999"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
            </label>
            </div>

            <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Recebimento
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Escolha entre entrega ou retirada antes de finalizar.
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Como voce quer receber seu pedido?
                </span>
                <Select
                  value={deliveryMethod}
                  onChange={(event) =>
                    setDeliveryMethod(event.target.value as DeliveryMethod)
                  }
                >
                  <option value="DELIVERY">Entrega</option>
                  <option value="PICKUP">Retirada</option>
                </Select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Para quando voce quer seu dadinho?
                </span>
                <Input
                  type="date"
                  value={desiredDate}
                  onChange={(event) => setDesiredDate(event.target.value)}
                />
              </label>

              {deliveryMethod === "DELIVERY" ? (
                <>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">CEP</span>
                <Input
                  inputMode="numeric"
                  placeholder="09750-000"
                  value={zipCode}
                  onChange={(event) =>
                    setZipCode(formatZipCode(event.target.value))
                  }
                />
              </label>

            {isLoadingAddress ? (
              <p className="text-sm text-text-muted">Buscando endereco...</p>
            ) : null}

            {(street || neighborhood || city || state) ? (
              <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Endereco encontrado
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input readOnly value={street} />
                  <Input readOnly value={neighborhood} />
                  <Input readOnly value={city} />
                  <Input readOnly value={state} />
                </div>
              </div>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Numero</span>
              <Input
                placeholder="123"
                value={addressNumber}
                onChange={(event) => setAddressNumber(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Complemento
              </span>
              <Input
                placeholder="Apto 12"
                value={addressComplement}
                onChange={(event) => setAddressComplement(event.target.value)}
              />
            </label>
                </>
              ) : (
                <div className="rounded-[var(--radius-control)] border border-border-strong bg-background/25 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Pedido para retirada
                  </p>
                  <p className="mt-2 text-sm text-text-muted">
                    Vamos preparar seu pedido para retirada. Depois de enviar,
                    voce tambem pode combinar o horario pelo WhatsApp.
                  </p>
                  <Button
                    className="mt-4"
                    disabled={!pickupWhatsAppUrl || selectedItems.length === 0}
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
                    Combinar retirada no WhatsApp
                  </Button>
                  {!pickupWhatsAppUrl ? (
                    <p className="mt-3 text-sm text-text-muted">
                      O numero do WhatsApp da Giu ainda nao esta configurado.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[var(--radius-control)] border border-border-soft bg-background/20 p-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Observacao
                </span>
                <textarea
                  className="ui-focus min-h-28 w-full rounded-[var(--radius-control)] border border-transparent bg-[#f5e6d3] px-4 py-3 text-sm text-text-contrast placeholder:text-[#7f6454] shadow-soft"
                  placeholder="Ex.: Entregar a partir das 15h"
                  value={orderNotes}
                  onChange={(event) => setOrderNotes(event.target.value)}
                />
              </label>
            </div>

            <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Itens selecionados
              </h3>

              {selectedItems.length === 0 ? (
                <p className="mt-3 text-sm text-text-muted">
                  Nenhum item selecionado ainda.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {selectedItems.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.product.name}
                        </p>
                        <p className="text-sm text-text-muted">
                          Quantidade: {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {formatPrice(item.product.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-border-strong bg-surface-muted/60 px-4 py-4">
              <span className="text-sm font-medium text-text-muted">
                Total estimado
              </span>
              <span className="text-2xl font-semibold text-accent">
                {formatPrice(visualTotal)}
              </span>
            </div>

            {orderNotes.trim() ? (
              <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Observacao do pedido
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  {orderNotes.trim()}
                </p>
              </div>
            ) : null}

            {desiredDate ||
            deliveryMethod === "PICKUP" ||
            street ||
            addressNumber ||
            addressComplement ? (
              <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Recebimento e atendimento
                </p>
                <div className="mt-2 space-y-2 text-sm text-text-muted">
                  <p>Como receber: {formatDeliveryMethodLabel(deliveryMethod)}</p>
                  {desiredDate ? (
                    <p>Para quando: {formatOrderDesiredDate(desiredDate)}</p>
                  ) : null}
                  {deliveryMethod === "DELIVERY" &&
                  formatOrderAddress({
                    street,
                    neighborhood,
                    city,
                    state,
                    addressNumber,
                    addressComplement,
                  }) ? (
                    <p>
                      Endereco:{" "}
                      {formatOrderAddress({
                        street,
                        neighborhood,
                        city,
                        state,
                        addressNumber,
                        addressComplement,
                      })}
                    </p>
                  ) : null}
                  {deliveryMethod === "DELIVERY" && zipCode ? (
                    <p>CEP: {formatZipCode(zipCode)}</p>
                  ) : null}
                  {deliveryMethod === "PICKUP" ? (
                    <p>Retirada combinada diretamente com a Giu.</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Button
              disabled={isSubmitting || isLoadingProducts || isLoadingAddress}
              fullWidth
              type="submit"
              variant="primary"
              className="min-h-13 text-base"
            >
              {isSubmitting ? "Enviando pedido..." : "Finalizar pedido"}
            </Button>
          </form>
        </Card>
      </PageContainer>
    </main>
  );
}
