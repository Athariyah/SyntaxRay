import Link from "next/link";

export const metadata = {
  title: "Ревью не найдено — SyntaxRay",
  // Служебная страница: не индексировать.
  robots: { index: false, follow: false },
};

/**
 * 404 конкретного ревью. Типичные причины:
 *  - заявка удалена из дашборда;
 *  - база без DATABASE_URL (встроенная PGlite) обнулилась после
 *    холодного старта — тогда работа осталась только в дашборде
 *    другого инстанса;
 *  - опечатка в ссылке.
 */
export default function ReviewNotFound() {
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
