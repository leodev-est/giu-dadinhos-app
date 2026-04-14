import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { buildPublicWhatsAppUrl } from "@/lib/public-whatsapp";

const publicWhatsAppMessage =
  "Olá! Gostaria de saber mais sobre os dadinhos.";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <PageContainer className="flex min-h-[calc(100vh-220px)] items-center justify-center py-10">
        <Card className="w-full max-w-3xl space-y-8 p-6 text-center sm:p-10">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-border-strong bg-background/25 px-4 py-2 text-sm font-medium text-accent">
              Feito sob encomenda e pronta entrega
            </span>

            <PageTitle
              eyebrow="Dadinhos da Giu"
              title="Dadinhos de tapioca artesanais, feitos sob encomenda ou pronta entrega."
              subtitle="Escolha seus produtos, envie seu pedido em poucos passos e fale com a Giu sempre que precisar."
            />
          </div>

          <div className="grid gap-3 sm:mx-auto sm:max-w-xl sm:grid-cols-2">
            <Link
              className="inline-flex min-h-13 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-accent px-5 py-3 text-base font-semibold text-text-contrast transition hover:bg-accent-strong"
              href="/pedido"
            >
              Fazer pedido
            </Link>

            <a
              className="inline-flex min-h-13 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-5 py-3 text-base font-semibold text-foreground transition hover:bg-surface-muted"
              href={buildPublicWhatsAppUrl(publicWhatsAppMessage)}
              rel="noreferrer"
              target="_blank"
            >
              Falar no WhatsApp
            </a>
          </div>

          <div className="grid gap-3 text-left sm:grid-cols-3">
            <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
              <p className="text-sm font-semibold text-foreground">Pedido simples</p>
              <p className="mt-2 text-sm text-text-muted">
                Fluxo rapido para escolher os itens e finalizar.
              </p>
            </div>

            <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
              <p className="text-sm font-semibold text-foreground">Atendimento direto</p>
              <p className="mt-2 text-sm text-text-muted">
                WhatsApp disponivel para combinar detalhes quando precisar.
              </p>
            </div>

            <div className="rounded-[var(--radius-control)] border border-border-soft bg-background/25 p-4">
              <p className="text-sm font-semibold text-foreground">Feito com cuidado</p>
              <p className="mt-2 text-sm text-text-muted">
                Dadinhos artesanais preparados para cada momento.
              </p>
            </div>
          </div>
        </Card>
      </PageContainer>
    </main>
  );
}

