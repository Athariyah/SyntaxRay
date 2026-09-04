"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthButtons } from "@/components/auth-buttons";

const NAV = [
  { href: "/", label: "Обзор" },
  { href: "/dashboard", label: "Дашборд" },
  { href: "/new", label: "Новое ревью" },
  { href: "/docs", label: "Документация" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="relative grid h-10 w-10 place-items-center rounded-2xl border border-ray-300/35 bg-gradient-to-br from-ray-300 via-ray-400 to-violet-ray shadow-[0_0_35px_-14px_rgba(56,211,245,0.95)]">
            <svg viewBox="0 0 28 28" className="h-6 w-6 text-ink-950" fill="none" strokeWidth="2.2" aria-hidden="true">
              <path d="M14 3.5 23 7.4v6.3c0 6.2-3.4 10.8-9 12.8-5.6-2-9-6.6-9-12.8V7.4l9-3.9Z" fill="currentColor" opacity="0.18" />
              <path d="M10.6 10 7.3 14l3.3 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m17.4 10 3.3 4-3.3 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m15.2 8.4-2.4 11.2" stroke="currentColor" strokeLinecap="round" opacity="0.75" />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-slate-100">
              Синтекс<span className="text-ray-300">Пруф</span>
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              static · ai · review
            </span>
          </span>
        </Link>

        {/* Десктоп-навигация: активный пункт — обычным CSS-классом.
            Раньше здесь был framer-motion `layoutId="nav-pill"` с пружиной:
            каждый переход считал layout всей шапки и дёргал анимацию,
            что давало лаг при переключении вкладок. */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                prefetch
                className={`rounded-lg px-3.5 py-2 text-sm transition-colors ${
                  active
                    ? "border border-white/10 bg-white/[0.06] text-slate-100"
                    : "border border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex">
            <AuthButtons />
          </div>
          <Link
            href="/new"
            className="hidden rounded-lg bg-gradient-to-r from-ray-400 to-violet-ray px-4 py-2 text-sm font-medium text-ink-950 shadow-[0_0_30px_-8px_rgba(56,211,245,0.8)] transition-transform hover:scale-[1.03] active:scale-[0.98] sm:inline-block"
          >
            Загрузить код
          </Link>
          {/* Мобильное меню: раньше на телефоне вкладок не было вообще */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Меню навигации"
            className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-slate-300 md:hidden"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <nav className="animate-page-in border-t border-white/5 px-6 py-3 md:hidden" aria-label="Мобильная навигация">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm ${
                  active ? "bg-white/[0.06] text-slate-100" : "text-slate-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-3 flex items-center justify-center border-t border-white/5 pt-3">
            <AuthButtons />
          </div>
          <Link
            href="/new"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-lg bg-gradient-to-r from-ray-400 to-violet-ray px-3 py-2.5 text-center text-sm font-medium text-ink-950"
          >
            Загрузить код
          </Link>

        </nav>
      )}
    </header>
  );
}
