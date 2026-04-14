import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dadinhos Giu",
  description: "Sistema de pedidos e controle para a Dadinhos Giu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <div className="relative min-h-screen overflow-x-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,184,96,0.22),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(217,154,59,0.18),_transparent_30%)]" />

          <div className="relative z-10 flex min-h-screen flex-col">
            <AppHeader />

            <div className="flex-1">{children}</div>

            <footer className="border-t border-border-soft bg-[#2f2018]/70">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-[var(--space-page)] py-5 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
                <p>Dadinhos Giu</p>
                <p>Seus pedidos organizados com o carinho que seus clientes merecem.</p>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
