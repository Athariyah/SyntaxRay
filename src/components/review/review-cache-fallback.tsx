"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReviewContent, type ReviewContentData } from "@/components/review/review-content";
import { readReview } from "@/lib/review-cache";

/**
 * Клиентский фолбэк для страницы ревью, когда серверная БД не вернула
 * заявку (например, PGlite на Vercel без DATABASE_URL — данные эфемерны
 * и не разделяются между инстансами функций). Если ревью только что было
 * создано в этой вкладке, показываем его из sessionStorage; иначе —
 * дружелюбную заглушку «ревью не найдено».
 */
export function ReviewCacheFallback({ publicId }: { publicId: string }) {
  const [data, setData] = useState<ReviewContentData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Читаем хранилище сессии асинхронно после гидрации, чтобы серверный
    // и клиентский рендер совпадали (на сервере sessionStorage нет).
    const timer = setTimeout(() => {
      setData(readReview(publicId));
      setChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [publicId]);

  if (!checked) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
        <div className="glass-strong rounded-2xl p-6">
          <div className="skeleton h-6 w-64" />
          <div className="mt-3 skeleton h-3 w-96" />
          <div className="mt-6 grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_420px]">
            <div className="skeleton h-64 w-full" />
            <div className="skeleton h-[520px] w-full" />
            <div className="skeleton h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (data) {
    return (
      <>
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs leading-relaxed text-amber-100">
            Это ревью показано из временного хранилища браузера: на деплое не задан{" "}
            <span className="font-mono">DATABASE_URL</span>, поэтому постоянная база недоступна.
            Чтобы работы сохранялись между визитами, добавьте{" "}
            <span className="font-mono">DATABASE_URL</span> в переменные окружения.
          </p>
        </div>
        <ReviewContent data={data} similarPairs={[]} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="font-mono text-sm text-ray-400/70">ошибка 404 · ревью</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Работа не найдена</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
        Такого ревью нет в базе: возможно, его удалили, либо временное хранилище было сброшено
        (без <span className="font-mono text-slate-300">DATABASE_URL</span> данные живут только до
        перезапуска). Отправьте код ещё раз — это займёт меньше минуты.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/new"
          className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-6 py-3 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02]"
        >
          Отправить код заново
        </Link>
        <Link
          href="/dashboard"
          className="glass rounded-xl px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-ray-400/30 hover:text-white"
        >
          К дашборду
        </Link>
      </div>
    </div>
  );
}
