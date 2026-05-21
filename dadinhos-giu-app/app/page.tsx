import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { buildPublicWhatsAppUrl } from "@/lib/public-whatsapp";

const publicWhatsAppMessage =
  "Ola! Gostaria de saber mais sobre os dadinhos.";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="relative min-h-[76vh] overflow-hidden border-b border-border-soft">
        <Image
          alt="Dadinhos de tapioca artesanais da Giu"
          className="absolute inset-0 h-full w-full object-cover"
          fill
          priority
          sizes="100vw"
          src="/dadinhos-hero.png"
        />
        <div className="absolute inset-0 bg-[#2b1a12]/62" />
        <PageContainer className="relative flex min-h-[76vh] items-center pb-20 pt-16">
          <div className="max-w-3xl space-y-7">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-[#f5e6d3]/35 bg-[#f5e6d3]/12 px-4 py-2 text-sm font-medium text-[#f8d68a]">
                Feito sob encomenda e pronta entrega
              </span>
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                  Dadinhos da Giu
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold text-foreground sm:text-5xl">
                  Dadinhos de tapioca artesanais
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[#f5e6d3] sm:text-lg">
                  Escolha seus produtos, envie seu pedido em poucos passos e fale com a Giu sempre que precisar.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
              <Link
                className="inline-flex min-h-13 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-accent px-5 py-3 text-base font-semibold text-text-contrast transition hover:bg-accent-strong"
                href="/pedido"
              >
                Fazer pedido
              </Link>

              <a
                className="inline-flex min-h-13 items-center justify-center rounded-[var(--radius-control)] border border-[#f5e6d3]/35 bg-[#f5e6d3]/12 px-5 py-3 text-base font-semibold text-foreground transition hover:bg-[#f5e6d3]/18"
                href={buildPublicWhatsAppUrl(publicWhatsAppMessage)}
                rel="noreferrer"
                target="_blank"
              >
                Falar no WhatsApp
              </a>
            </div>
          </div>
        </PageContainer>
      </section>

      <PageContainer className="py-8">
        <div className="grid gap-3 text-left sm:grid-cols-3">
          <Card className="bg-[#4d3526] p-4">
            <p className="text-sm font-semibold text-foreground">Pedido simples</p>
            <p className="mt-2 text-sm text-text-muted">
              Fluxo rapido para escolher os itens e finalizar.
            </p>
          </Card>

          <Card className="bg-[#40543b] p-4">
            <p className="text-sm font-semibold text-foreground">Atendimento direto</p>
            <p className="mt-2 text-sm text-text-muted">
              WhatsApp disponivel para combinar detalhes quando precisar.
            </p>
          </Card>

          <Card className="bg-[#69422c] p-4">
            <p className="text-sm font-semibold text-foreground">Feito com cuidado</p>
            <p className="mt-2 text-sm text-text-muted">
              Dadinhos artesanais preparados para cada momento.
            </p>
          </Card>
        </div>
      </PageContainer>
    </main>
  );
}
