"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stockQuantity: number;
  bulkMinQty: number | null;
  bulkPrice: number | null;
  imageUrl: string | null;
  gramWeight: number | null;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

export default function CardapioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/produtos", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Product[];
        setProducts(data.filter((p) => p.active));
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-8 py-10">
        <div className="text-center">
          <PageTitle>Cardapio</PageTitle>
          <p className="mt-2 text-text-muted">Conhea nossos produtos artesanais feitos com carinho.</p>
        </div>

        {isLoading && (
          <p className="text-center text-text-muted">Carregando cardapio...</p>
        )}

        {!isLoading && products.length === 0 && (
          <p className="text-center text-text-muted">Nenhum produto disponivel no momento.</p>
        )}

        {!isLoading && products.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const hasPromo = product.bulkMinQty !== null && product.bulkPrice !== null;
              const inStock = product.stockQuantity > 0;
              return (
                <Card key={product.id} className="flex flex-col overflow-hidden p-0">
                  {product.imageUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden bg-white/5">
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-white/5 text-4xl">
                      🍬
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold text-foreground">{product.name}</h2>
                      {!inStock && (
                        <span className="shrink-0 rounded-full bg-red-950/60 px-2 py-0.5 text-xs text-red-300">
                          Esgotado
                        </span>
                      )}
                    </div>

                    {product.gramWeight && (
                      <p className="text-xs text-text-muted">{product.gramWeight}g por unidade</p>
                    )}

                    <div className="mt-auto space-y-1">
                      <p className="text-xl font-bold text-accent">{formatPrice(product.price)}</p>
                      {hasPromo && (
                        <p className="text-xs font-medium text-green-400">
                          Promocao: {product.bulkMinQty}x por {formatPrice(product.bulkPrice!)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="text-center">
          <Link href="/pedido">
            <Button variant="primary" size="lg">Fazer pedido</Button>
          </Link>
        </div>
      </PageContainer>
    </main>
  );
}
