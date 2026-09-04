import Link from "next/link";

export const metadata = {
  title: "Страница не найдена — SyntaxRay",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="font-mono text-sm text-ray-400/70">ошибка 404</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
        Возможно, ссылка устарела или набрана с опечаткой. Если вы только что отправили код на
        ревью — откройте дашборд: работа появится в списке, как только анализ завершится.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-6 py-3 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02]"
        >
          К дашборду
        </Link>
        <Link
          href="/new"
          className="glass rounded-xl px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-ray-400/30 hover:text-white"
        >
          Новое ревью
        </Link>
      </div>
    </div>
  );
}
