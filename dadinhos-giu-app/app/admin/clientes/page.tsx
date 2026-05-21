"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";

type LoyaltyCard = {
  stars: number;
  totalGrams: number;
  redeemedRewards: number;
  pendingRewards: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  loyaltyCard: LoyaltyCard | null;
  isFirstTimeCustomer: boolean;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Nunca";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function StarsDisplay({ stars }: { stars: number }) {
  const filled = Math.min(stars % 10 === 0 && stars > 0 ? 10 : stars % 10, 10);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < filled ? "text-accent" : "text-white/20"} style={{ fontSize: 12 }}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function AdminClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/clientes");
        if (!res.ok) return;
        const data = (await res.json()) as Customer[];
        setCustomers(data);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  );

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageTitle title="Clientes" />
          <div className="w-full sm:max-w-xs">
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading && <p className="text-center text-text-muted">Carregando clientes...</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-text-muted">Nenhum cliente encontrado.</p>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((customer) => (
              <Card key={customer.id} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-foreground">{customer.name}</h2>
                      {customer.isFirstTimeCustomer && (
                        <span className="rounded-full bg-blue-950/60 px-2 py-0.5 text-xs font-medium text-blue-300">
                          Novo cliente
                        </span>
                      )}
                      {customer.loyaltyCard?.pendingRewards ? customer.loyaltyCard.pendingRewards > 0 && (
                        <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-xs font-medium text-amber-300">
                          {customer.loyaltyCard.pendingRewards} brinde(s) pendente(s)
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-text-muted">{customer.phone}</p>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{customer.orderCount}</p>
                      <p className="text-text-muted">pedidos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-accent">{formatPrice(customer.totalSpent)}</p>
                      <p className="text-text-muted">total gasto</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{formatDate(customer.lastOrderAt)}</p>
                      <p className="text-text-muted">ultimo pedido</p>
                    </div>
                  </div>
                </div>

                {customer.loyaltyCard && (
                  <div className="mt-4 border-t border-border-soft pt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="mb-1 text-xs text-text-muted">Cartao Fidelidade — {customer.loyaltyCard.stars} estrela(s)</p>
                        <StarsDisplay stars={customer.loyaltyCard.stars} />
                      </div>
                      <div className="flex gap-4 text-xs text-text-muted">
                        <span>{customer.loyaltyCard.totalGrams}g acumulados</span>
                        <span>{customer.loyaltyCard.redeemedRewards} brinde(s) resgatado(s)</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </PageContainer>
    </main>
  );
}
