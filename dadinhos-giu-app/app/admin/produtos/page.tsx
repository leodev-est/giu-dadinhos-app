"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { StatusBadge } from "@/components/ui/status-badge";

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stockQuantity: number;
  createdAt: string;
};

type ApiError = {
  error?: string;
};

type ProductFormState = {
  name: string;
  price: string;
  stockQuantity: string;
  active: boolean;
};

const initialFormState: ProductFormState = {
  name: "",
  price: "",
  stockQuantity: "0",
  active: true,
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default function AdminProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductFormState>(initialFormState);
  const [editingForms, setEditingForms] = useState<Record<string, ProductFormState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadProducts() {
    setErrorMessage("");

    const response = await fetch("/api/produtos", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel carregar os produtos.");
    }

    const data = (await response.json()) as Product[];
    setProducts(data);
    setEditingForms(
      Object.fromEntries(
        data.map((product) => [
          product.id,
          {
            name: product.name,
            price: product.price.toFixed(2),
            stockQuantity: String(product.stockQuantity),
            active: product.active,
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    async function hydrateProducts() {
      try {
        await loadProducts();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar os produtos.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void hydrateProducts();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = form.name.trim();
    const parsedPrice = Number(form.price);
    const parsedStockQuantity = Number(form.stockQuantity);

    if (!trimmedName) {
      setErrorMessage("Informe o nome do produto.");
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage("Informe um preco maior que zero.");
      return;
    }

    if (!Number.isInteger(parsedStockQuantity) || parsedStockQuantity < 0) {
      setErrorMessage("Informe um estoque valido.");
      return;
    }

    const response = await fetch("/api/produtos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: trimmedName,
        price: parsedPrice,
        stockQuantity: parsedStockQuantity,
        active: form.active,
      }),
    });

    const data = (await response.json()) as Product | ApiError;

    if (!response.ok) {
      setErrorMessage(
        "error" in data
          ? data.error ?? "Nao foi possivel cadastrar o produto."
          : "Nao foi possivel cadastrar o produto.",
      );
      return;
    }

    setForm(initialFormState);
    setSuccessMessage("Produto cadastrado com sucesso.");

    startTransition(() => {
      void loadProducts().catch(() => {
        setErrorMessage("Produto criado, mas a lista nao foi atualizada.");
      });
    });
  }

  async function handleUpdateProduct(productId: string) {
    setErrorMessage("");
    setSuccessMessage("");

    const editingForm = editingForms[productId];

    if (!editingForm) {
      return;
    }

    const trimmedName = editingForm.name.trim();
    const parsedPrice = Number(editingForm.price);
    const parsedStockQuantity = Number(editingForm.stockQuantity);

    if (!trimmedName) {
      setErrorMessage("Informe o nome do produto.");
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage("Informe um preco maior que zero.");
      return;
    }

    if (!Number.isInteger(parsedStockQuantity) || parsedStockQuantity < 0) {
      setErrorMessage("Informe um estoque valido.");
      return;
    }

    setSavingProductId(productId);

    try {
      const response = await fetch(`/api/produtos/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          price: parsedPrice,
          stockQuantity: parsedStockQuantity,
          active: editingForm.active,
        }),
      });

      const data = (await response.json()) as Product | ApiError;

      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error ?? "Nao foi possivel atualizar o produto."
            : "Nao foi possivel atualizar o produto.",
        );
      }

      const updatedProduct = data as Product;

      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? updatedProduct : product,
        ),
      );
      setEditingForms((current) => ({
        ...current,
        [productId]: {
          name: updatedProduct.name,
          price: updatedProduct.price.toFixed(2),
          stockQuantity: String(updatedProduct.stockQuantity),
          active: updatedProduct.active,
        },
      }));
      setSuccessMessage("Produto atualizado com sucesso.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o produto.",
      );
    } finally {
      setSavingProductId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <PageTitle
            eyebrow="Admin de Produtos"
            title="Cadastrar produto"
            subtitle="Cadastre novos itens do catalogo e valide a integracao real com a API."
          />

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Nome</span>
              <Input
                name="name"
                placeholder="Ex.: Dadinho 250g"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Preco</span>
              <Input
                min="0.01"
                name="price"
                placeholder="20.00"
                step="0.01"
                type="number"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Estoque</span>
              <Input
                min="0"
                name="stockQuantity"
                placeholder="0"
                step="1"
                type="number"
                value={form.stockQuantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    stockQuantity: event.target.value,
                  }))
                }
              />
            </label>

            <label className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border-soft bg-surface-muted/60 px-4 py-3">
              <input
                checked={form.active}
                type="checkbox"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              <span className="text-sm font-medium text-foreground">
                Produto ativo
              </span>
            </label>

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

            <Button disabled={isPending} fullWidth type="submit" variant="primary">
              {isPending ? "Salvando..." : "Cadastrar produto"}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <PageTitle
              className="space-y-1"
              title="Catalogo de produtos"
              subtitle="Listagem vinda da API real em `/api/produtos`."
            />
            <span className="rounded-full border border-border-strong bg-background/25 px-3 py-1 text-sm font-medium text-text-muted">
              {products.length} item(ns)
            </span>
          </div>

          {isLoading ? (
            <p className="mt-6 text-sm text-text-muted">Carregando produtos...</p>
          ) : null}

          {!isLoading && products.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius-control)] border border-dashed border-border-soft bg-surface-muted/70 px-4 py-6 text-sm text-text-muted">
              Nenhum produto cadastrado ainda.
            </div>
          ) : null}

          {products.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <Card
                  key={product.id}
                  className="border-border-strong bg-surface-muted p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{product.name}</h3>
                      <p className="mt-1 text-sm text-text-muted">
                        {formatPrice(product.price)}
                      </p>
                    </div>
                    <StatusBadge
                      status={product.active ? "DELIVERED" : "CANCELLED"}
                    >
                      {product.active ? "ATIVO" : "INATIVO"}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 rounded-[var(--radius-control)] border border-border-soft bg-background/25 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Estoque atual
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {product.stockQuantity}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        Nome
                      </span>
                      <Input
                        value={editingForms[product.id]?.name ?? ""}
                        onChange={(event) =>
                          setEditingForms((current) => ({
                            ...current,
                            [product.id]: {
                              ...(current[product.id] ?? {
                                name: product.name,
                                price: product.price.toFixed(2),
                                stockQuantity: String(product.stockQuantity),
                                active: product.active,
                              }),
                              name: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          Preco
                        </span>
                        <Input
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={editingForms[product.id]?.price ?? ""}
                          onChange={(event) =>
                            setEditingForms((current) => ({
                              ...current,
                              [product.id]: {
                                ...(current[product.id] ?? {
                                  name: product.name,
                                  price: product.price.toFixed(2),
                                  stockQuantity: String(product.stockQuantity),
                                  active: product.active,
                                }),
                                price: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          Estoque
                        </span>
                        <Input
                          min="0"
                          step="1"
                          type="number"
                          value={editingForms[product.id]?.stockQuantity ?? ""}
                          onChange={(event) =>
                            setEditingForms((current) => ({
                              ...current,
                              [product.id]: {
                                ...(current[product.id] ?? {
                                  name: product.name,
                                  price: product.price.toFixed(2),
                                  stockQuantity: String(product.stockQuantity),
                                  active: product.active,
                                }),
                                stockQuantity: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border-soft bg-surface px-4 py-3">
                      <input
                        checked={editingForms[product.id]?.active ?? product.active}
                        type="checkbox"
                        onChange={(event) =>
                          setEditingForms((current) => ({
                            ...current,
                            [product.id]: {
                              ...(current[product.id] ?? {
                                name: product.name,
                                price: product.price.toFixed(2),
                                stockQuantity: String(product.stockQuantity),
                                active: product.active,
                              }),
                              active: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="text-sm font-medium text-foreground">
                        Produto ativo
                      </span>
                    </label>

                    <Button
                      disabled={savingProductId === product.id}
                      fullWidth
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void handleUpdateProduct(product.id);
                      }}
                    >
                      {savingProductId === product.id
                        ? "Salvando..."
                        : "Salvar ajustes"}
                    </Button>
                  </div>

                  <p className="mt-4 text-xs text-text-muted">
                    Criado em {new Date(product.createdAt).toLocaleString("pt-BR")}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}
        </Card>
      </PageContainer>
    </main>
  );
}
