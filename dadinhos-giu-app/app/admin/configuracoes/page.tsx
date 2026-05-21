"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";

type Settings = Record<string, string>;

const SETTING_LABELS: Record<string, { label: string; description: string; placeholder: string }> = {
  deliveryFee: {
    label: "Taxa de entrega (R$)",
    description: "Valor cobrado por entrega. Use 0 para entrega gratis.",
    placeholder: "Ex: 5.00",
  },
  orderCutoffHour: {
    label: "Horario limite para pedidos no dia (hora)",
    description: "Pedidos apos este horario so podem ser feitos para o dia seguinte. Ex: 11 = limite 11h.",
    placeholder: "Ex: 11",
  },
  businessPhone: {
    label: "Telefone para contato (WhatsApp)",
    description: "Numero com DDD, sem espacos. Ex: 5511999999999",
    placeholder: "5511999999999",
  },
  pixKey: {
    label: "Chave PIX",
    description: "Chave PIX exibida para o cliente apos o pedido.",
    placeholder: "email@exemplo.com ou CPF/CNPJ",
  },
  pixKeyType: {
    label: "Tipo da chave PIX",
    description: "Tipo da chave: cpf, cnpj, email, phone ou random.",
    placeholder: "email",
  },
};

export default function AdminConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/configuracoes");
        if (!res.ok) return;
        const data = (await res.json()) as Settings;
        setSettings(data);
        setEditing(data);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  async function saveSetting(key: string) {
    const value = (editing[key] ?? "").trim();
    if (!value) return;
    setSavingKey(key);
    try {
      const res = await fetch("/api/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, [key]: value }));
        setFeedback((prev) => ({ ...prev, [key]: "Salvo!" }));
        setTimeout(() => setFeedback((prev) => ({ ...prev, [key]: "" })), 2000);
      }
    } finally {
      setSavingKey(null);
    }
  }

  const settingKeys = Object.keys(SETTING_LABELS);

  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="space-y-6 py-10">
        <PageTitle>Configuracoes</PageTitle>

        {isLoading ? (
          <p className="text-center text-text-muted">Carregando...</p>
        ) : (
          <div className="space-y-4 max-w-xl">
            {settingKeys.map((key) => {
              const meta = SETTING_LABELS[key]!;
              return (
                <Card key={key} className="space-y-3 p-5">
                  <div>
                    <p className="font-semibold text-foreground">{meta.label}</p>
                    <p className="text-xs text-text-muted">{meta.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={meta.placeholder}
                      value={editing[key] ?? ""}
                      onChange={(e) =>
                        setEditing((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                    <Button
                      variant="primary"
                      disabled={savingKey === key}
                      onClick={() => saveSetting(key)}
                    >
                      {savingKey === key ? "..." : feedback[key] ? feedback[key] : "Salvar"}
                    </Button>
                  </div>
                  {settings[key] && (
                    <p className="text-xs text-text-muted">
                      Atual: <span className="text-foreground">{settings[key]}</span>
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </PageContainer>
    </main>
  );
}
