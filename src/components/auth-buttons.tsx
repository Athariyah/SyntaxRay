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
    <div className="flex items-center gap-1.5">
      {providers.slice(0, 4).map((p) => (
        <a
          key={p.name}
          href={`/api/auth/${p.name}`}
          title={`Войти через ${p.label}`}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold transition hover:scale-105 hover:bg-white/10"
          style={{ borderColor: `${p.color}33` }}
        >
          <span style={{ color: p.color }}>{p.icon}</span>
        </a>
      ))}
      <a
        href="/login"
        className="ml-1 hidden rounded-lg bg-gradient-to-r from-ray-400 to-violet-ray px-4 py-2 text-sm font-medium text-ink-950 sm:inline-block"
      >
        Войти
      </a>
    </div>
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
            className="grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ background: p.color }}
          >
            {p.icon}
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
