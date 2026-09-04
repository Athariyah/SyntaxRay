import Link from "next/link";
import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { findings, submissions } from "@/db/schema";
import { Reveal } from "@/components/reveal";
import { LiveDemo } from "@/components/live-demo";
import { RoiCalculator } from "@/components/roi-calculator";
import { isGeminiConfigured } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  {
    icon: "🧠",
    title: "Семантическое ревью Gemini",
    text: "Академический системный промпт заставляет модель обосновывать каждое замечание последствиями в runtime, а не общими фразами.",
  },
  {
    icon: "📈",
    title: "Асимптотическая оценка",
    text: "Определяем фактическую сложность: вложенные циклы O(N²), наивная рекурсия O(2^N), strlen в условии цикла и линейный поиск в set-сценариях.",
  },
  {
    icon: "🧯",
    title: "Память и указатели",
    text: "Парность malloc/free и new/delete[], RAII, висячие указатели, use-after-free, незакрытые дескрипторы, отсутствие проверки NULL.",
  },
  {
    icon: "🏛",
    title: "Архитектура и DRY",
    text: "Длина функций, связность, дублирующиеся блоки, глобальное состояние, магические константы и тестируемость модулей.",
  },
  {
    icon: "🛡",
    title: "Изолированная песочница",
    text: "Компиляция и запуск линтеров в Docker-контейнере: network=none, read-only rootfs, seccomp, лимиты CPU/RAM и pids.",
  },
  {
    icon: "✍️",
    title: "Inline-комментарии в коде",
    text: "Monaco Editor подсвечивает конкретные строки: маркеры, glyph-полоса и панель замечаний синхронизированы между собой.",
  },
];

const PIPELINE = [
  { step: "01", title: "Загрузка", text: "Архив .zip, ссылка на GitHub или вставленный фрагмент кода." },
  { step: "02", title: "Песочница", text: "FastAPI поднимает контейнер, компилирует и прогоняет статические анализаторы." },
  { step: "03", title: "ИИ-ревью", text: "Метрики и пронумерованный код уходят в Gemini с академическим промптом." },
  { step: "04", title: "Отчёт", text: "Замечания привязываются к строкам, выводится оценка, асимптотика и план правок." },
];

export default async function LandingPage() {
  // Статистика не должна ронять лендинг, если БД недоступна
  // (например, не задан DATABASE_URL на свежем деплое).
  let submissionStats: { value: number } | undefined;
  let findingStats: { value: number } | undefined;
  try {
    const db = await getDb();
    [submissionStats] = await db.select({ value: count() }).from(submissions);
    [findingStats] = await db.select({ value: count() }).from(findings);
  } catch (error) {
    console.error("[landing] статистика БД недоступна:", error);
  }
  const geminiOn = isGeminiConfigured();

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 pt-16">
      {/* HERO */}
      <section className="relative">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
            <span className={`h-1.5 w-1.5 rounded-full ${geminiOn ? "bg-emerald-400" : "bg-amber-400"}`} />
            {geminiOn ? "Gemini API подключён" : "Работает детерминированный движок · добавьте GEMINI_API_KEY"}
          </span>
        </Reveal>

        <Reveal delay={0.06}>
          <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Автоматизированное <span className="text-gradient">академическое ревью</span> исходного кода
          </h1>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            SyntaxRay проверяет работы студентов и участников хакатонов на C, C++ и Python: находит утечки памяти,
            неоптимальные алгоритмы и архитектурные ошибки — то, что не покажет ни один автотест LeetCode-типа.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/new"
              className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-6 py-3 text-sm font-semibold text-ink-950 shadow-[0_10px_40px_-12px_rgba(56,211,245,0.85)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Отправить код на ревью
            </Link>
            <Link
              href="/dashboard"
              className="glass rounded-xl px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-ray-400/30 hover:text-white"
            >
              Открыть дашборд преподавателя
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.24}>
          <dl className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { k: "Проверок выполнено", v: submissionStats?.value ?? 0 },
              { k: "Замечаний найдено", v: findingStats?.value ?? 0 },
              { k: "Языков поддержано", v: 3 },
              { k: "Осей проверки", v: 6 },
            ].map((item) => (
              <div key={item.k} className="glass rounded-2xl px-5 py-4">
                <dt className="text-xs uppercase tracking-wider text-slate-500">{item.k}</dt>
                <dd className="mt-2 font-mono text-3xl text-ray-300">{item.v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* ЖИВОЕ ДЕМО */}
      <section className="mt-20">
        <Reveal>
          <LiveDemo />
        </Reveal>
      </section>

      {/* ДЛЯ КОГО */}
      <section className="mt-28">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight">Кому это экономит время</h2>
          <p className="mt-2 text-slate-400">Один движок — три рынка с одной и той же болью.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: "🎓",
              title: "Вузы и колледжи",
              text: "120 студентов × 4 работы = 480 ревью за семестр. Платформа снимает рутину, преподаватель разбирает только сложные случаи.",
              points: ["Антиплагиат-фильтр пар", "CSV-ведомость в один клик", "Динамика группы по дням"],
            },
            {
              icon: "🚀",
              title: "Хакатоны и школы",
              text: "Сотни участников, десятки менторов. Мгновенный фидбэк держит мотивацию, а организаторы видят честную таблицу качества.",
              points: ["Ревью за 10–40 секунд", "Чек-лист «к пересдаче»", "Публичная ссылка на отчёт"],
            },
            {
              icon: "🏢",
              title: "Корпоративные академии",
              text: "Онбординг джунов и грейды без отрыва сеньоров от продакшена. Единая шкала 0–100 делает оценку найма воспроизводимой.",
              points: ["Шесть осей проверки", "Экспорт JSON для HR-систем", "Изолированная песочница"],
            },
          ].map((a, i) => (
            <Reveal key={a.title} delay={0.06 * i}>
              <article className="glass flex h-full flex-col rounded-2xl p-6">
                <div className="text-2xl">{a.icon}</div>
                <h3 className="mt-4 text-base font-semibold text-slate-100">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.text}</p>
                <ul className="mt-4 space-y-1.5 border-t border-white/5 pt-4 text-xs text-slate-400">
                  {a.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="text-emerald-400">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ВОЗМОЖНОСТИ */}
      <section className="mt-28">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight">Что проверяет платформа</h2>
          <p className="mt-2 text-slate-400">Шесть осей академического ревью — от UB до читаемости.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item, i) => (
            <Reveal key={item.title} delay={0.05 * i}>
              <article className="glass group h-full rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-ray-400/30">
                <div className="text-2xl">{item.icon}</div>
                <h3 className="mt-4 text-base font-semibold text-slate-100">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ПАЙПЛАЙН */}
      <section className="mt-28">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight">Как устроен конвейер</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {PIPELINE.map((item, i) => (
            <Reveal key={item.step} delay={0.07 * i}>
              <div className="glass relative h-full overflow-hidden rounded-2xl p-6">
                <span className="font-mono text-xs text-ray-400/70">{item.step}</span>
                <h3 className="mt-3 font-semibold text-slate-100">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.text}</p>
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-ray-400/10 blur-2xl" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ROI */}
      <section className="mt-28">
        <Reveal>
          <RoiCalculator />
        </Reveal>
      </section>

      {/* ТАРИФЫ */}
      <section className="mt-28">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight">Тарифы</h2>
          <p className="mt-2 text-slate-400">Старт — бесплатно. Масштаб — по подписке.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              name: "Старт",
              price: "0 ₽",
              desc: "Для одного преподавателя",
              points: ["30 ревью в месяц", "Детерминированный движок", "Дашборд и CSV-ведомость"],
              cta: "Начать бесплатно",
              hot: false,
            },
            {
              name: "Кафедра",
              price: "9 900 ₽/мес",
              desc: "Для потока и методкомиссии",
              points: ["Безлимитные ревью", "Gemini-ревью + антиплагиат", "Аналитика группы и тренды", "Приоритетная поддержка"],
              cta: "Выбрать «Кафедру»",
              hot: true,
            },
            {
              name: "Кампус",
              price: "по запросу",
              desc: "Для вуза и EdTech-платформ",
              points: ["SSO и роли проверяющих", "On-premise песочница", "API и white-label", "SLA 99,9%"],
              cta: "Связаться с нами",
              hot: false,
            },
          ].map((t, i) => (
            <Reveal key={t.name} delay={0.06 * i}>
              <article
                className={`flex h-full flex-col rounded-2xl p-6 ${
                  t.hot ? "glass-strong border border-ray-400/30" : "glass"
                }`}
              >
                {t.hot && (
                  <span className="mb-3 w-fit rounded-full bg-gradient-to-r from-ray-400 to-violet-ray px-3 py-1 text-[11px] font-semibold text-ink-950">
                    ВЫБИРАЮТ ЧАЩЕ
                  </span>
                )}
                <h3 className="text-base font-semibold text-slate-100">{t.name}</h3>
                <p className="mt-1 font-mono text-2xl text-ray-300">{t.price}</p>
                <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-slate-400">
                  {t.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="text-ray-400">▸</span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/new"
                  className={`mt-6 rounded-xl px-5 py-2.5 text-center text-sm font-semibold transition-transform hover:scale-[1.02] ${
                    t.hot
                      ? "bg-gradient-to-r from-ray-400 to-violet-ray text-ink-950"
                      : "border border-white/10 text-slate-200 hover:border-ray-400/30"
                  }`}
                >
                  {t.cta}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* СТЕК */}
      <section className="mt-28">
        <Reveal>
          <div className="glass-strong rounded-3xl p-8 sm:p-12">
            <h2 className="text-2xl font-semibold tracking-tight">Технологический стек</h2>
            <div className="mt-8 grid gap-8 sm:grid-cols-3">
              {[
                { h: "Фронтенд", items: ["Next.js 16 (App Router)", "Tailwind CSS 4", "Framer Motion", "Monaco Editor", "Vercel"] },
                { h: "Бэкенд", items: ["Python FastAPI", "Docker sandbox", "gcc / clang-tidy / cppcheck", "valgrind / ruff / radon"] },
                { h: "ИИ и данные", items: ["Gemini API", "PostgreSQL + Drizzle ORM", "JSON-контракт findings", "Академический системный промпт"] },
              ].map((group) => (
                <div key={group.h}>
                  <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ray-300">{group.h}</h3>
                  <ul className="mt-4 space-y-2 text-sm text-slate-400">
                    {group.items.map((it) => (
                      <li key={it} className="flex gap-2">
                        <span className="text-ray-400/60">▸</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
