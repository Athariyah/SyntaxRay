import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { PageTransition } from "@/components/page-transition";
import "./globals.css";

export const metadata: Metadata = {
  title: "СинтексПруф — автоматизированное академическое ревью кода",
  description:
    "СинтексПруф — платформа статического анализа и ИИ-ревью кода на C, C++ и Python с поддержкой российских нейросетей (YandexGPT, Gigachat, GigaChat). Вход через Яндекс, VK, MAX, Госуслуги.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="grid-backdrop font-sans antialiased selection:bg-ray-400/30">
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <PageTransition>{children}</PageTransition>
          <footer className="border-t border-white/5 px-6 py-8 text-xs text-slate-500">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                СинтексПруф · статический анализ + YandexGPT · Gigachat · песочница Docker (network=none)
              </span>
              <span className="font-mono text-slate-600">C · C++ · Python 3</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
