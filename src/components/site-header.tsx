"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const NAV = [
  { href: "/", label: "Обзор" },
  { href: "/dashboard", label: "Дашборд" },
  { href: "/new", label: "Новое ревью" },
  { href: "/docs", label: "Документация" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Link href="/" className="group flex items-center gap-3">
          <motion.span
            initial={{ rotate: -12, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-ray-400/30 bg-ray-400/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-ray-300" fill="none" strokeWidth="1.8">
              <path d="M9 6 4 12l5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m15 6 5 6-5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.5 4.5 11 19.5" stroke="currentColor" strokeLinecap="round" opacity="0.55" />
            </svg>
          </motion.span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-slate-100">
              Syntax<span className="text-ray-300">Ray</span>
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              static · ai · review
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-3.5 py-2 text-sm transition-colors ${
                  active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/new"
          className="rounded-lg bg-gradient-to-r from-ray-400 to-violet-ray px-4 py-2 text-sm font-medium text-ink-950 shadow-[0_0_30px_-8px_rgba(56,211,245,0.8)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Загрузить код
        </Link>
      </div>
    </header>
  );
}
