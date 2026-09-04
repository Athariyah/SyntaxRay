"use client";

import { useEffect, useState } from "react";

type Provider = { name: string; label: string; color: string; icon: string; configured: boolean };
type SessionUser = { id: number; email?: string | null; name?: string | null; image?: string | null; provider?: string | null };

export function AuthButtons() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/auth/providers").then((r) => r.json()),
          fetch("/api/auth/session").then((r) => r.json()),
        ]);
        setProviders(pRes.providers ?? []);
        setUser(sRes.user ?? null);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-lg bg-white/5" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={user.name ?? ""} className="h-8 w-8 rounded-full border border-white/10" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-ray-400 to-violet-ray text-xs font-bold text-ink-950">
            {(user.name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-28 truncate text-sm text-slate-200 sm:inline">
          {user.name ?? user.email ?? "Профиль"}
        </span>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/signout"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          Выйти
        </a>
      </div>
    );
  }

  return (
    <a
      href="/login"
      className="rounded-lg bg-gradient-to-r from-ray-400 to-violet-ray px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03] active:scale-[0.98]"
      title={providers.length > 0 ? "Войти через Яндекс, VK ID, MAX или Госуслуги" : "Войти"}
    >
      Войти
    </a>
  );
}

export function FullAuthPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []));
  }, []);
  return (
    <div className="grid gap-3">
      {providers.map((p) => (
        <a
          key={p.name}
          href={`/api/auth/${p.name}`}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08] hover:border-white/20"
        >
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            style={{ background: providerIconBackground(p.name, p.color) }}
          >
            <ProviderIcon name={p.name} />
          </span>
          <span className="flex-1 text-left">Войти через {p.label}</span>
          <span className="text-slate-500">→</span>
        </a>
      ))}
      <p className="px-2 text-center text-xs text-slate-500">
        Нажимая «Войти», вы соглашаетесь с обработкой данных. Для демо режим работает без настройки ключей OAuth.
      </p>
    </div>
  );
}

function providerIconBackground(name: string, color: string): string {
  if (name === "gosuslugi") return "#FFFFFF";
  if (name === "max") return "linear-gradient(135deg,#2FA4FF 0%,#4A62F5 55%,#8B3DFF 100%)";
  return color;
}

function ProviderIcon({ name }: { name: string }) {
  if (name === "vk") {
    return (
      <svg viewBox="0 0 28 28" className="h-7 w-7 text-white" aria-hidden="true">
        <path
          fill="currentColor"
          d="M14.8 20.4c-6.1 0-9.6-4.2-9.8-11.2h3.1c.1 5.1 2.4 7.3 4.1 7.8V9.2h3v4.4c1.7-.2 3.4-2.2 4-4.4h3c-.5 2.7-2.6 4.7-4.1 5.6 1.5.7 4 2.5 5 5.6h-3.3c-.7-2.1-2.2-3.7-4.6-4v4h-.4Z"
        />
      </svg>
    );
  }
  if (name === "max") {
    // Логотип MAX: белый «пузырь» диалога — кольцо с хвостиком в левом нижнем углу.
    return (
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M14 4.5a9.5 9.5 0 1 1-6.9 16.03L4.6 22.9c-.7.5-1.6-.1-1.5-.9l.7-4.3A9.5 9.5 0 0 1 14 4.5Zm0 5.1a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z"
        />
      </svg>
    );
  }
  if (name === "gosuslugi") {
    // Логотип Госуслуг: шестиугольный контур с сине-красным градиентом и надпись «гос/услуги».
    return (
      <svg viewBox="0 0 28 28" className="h-9 w-9" aria-hidden="true">
        <defs>
          <linearGradient id="gu-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0D4CD3" />
            <stop offset="1" stopColor="#EE3F58" />
          </linearGradient>
        </defs>
        <path
          d="M14 1.6 25.2 7.9v12.2L14 26.4 2.8 20.1V7.9Z"
          fill="none"
          stroke="url(#gu-grad)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <text x="14" y="12.6" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="5.6" fill="#0D4CD3">
          гос
        </text>
        <text x="14" y="18.6" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="4.6" letterSpacing="-0.1" fill="#EE3F58">
          услуги
        </text>
      </svg>
    );
  }
  return <span className="text-lg font-black leading-none text-white">Я</span>;
}
