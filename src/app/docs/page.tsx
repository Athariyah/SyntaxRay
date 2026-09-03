import { Reveal } from "@/components/reveal";

export const metadata = { title: "Документация — SyntaxRay" };

const ENV_VARS = [
  ["GEMINI_API_KEY", "Ключ Google AI Studio. Без него платформа работает на детерминированном движке.", "обязательно для ИИ-ревью"],
  ["GEMINI_MODEL", "Модель Gemini (по умолчанию gemini-2.5-flash).", "опционально"],
  ["DATABASE_URL", "Строка подключения PostgreSQL (Neon/Supabase/Vercel Postgres).", "обязательно"],
  ["SANDBOX_API_URL", "Базовый URL FastAPI-раннера с Docker-песочницей.", "опционально"],
  ["SANDBOX_API_TOKEN", "Bearer-токен для защиты раннера.", "опционально"],
  ["GITHUB_TOKEN", "Повышает лимиты GitHub API при импорте репозиториев.", "опционально"],
];

const TREE = `syntaxray/
├─ src/                          # Next.js фронтенд (Vercel)
│  ├─ app/
│  │  ├─ page.tsx                # Лендинг
│  │  ├─ dashboard/page.tsx      # Дашборд преподавателя
│  │  ├─ new/page.tsx            # Загрузка кода
│  │  ├─ review/[publicId]/      # Ревью + Monaco Editor
│  │  ├─ docs/page.tsx           # Эта страница
│  │  └─ api/
│  │     ├─ health/route.ts
│  │     └─ submissions/         # CRUD + запуск пайплайна
│  ├─ components/
│  │  ├─ site-header.tsx         # Навигация (Framer Motion)
│  │  ├─ page-transition.tsx     # Переходы между страницами
│  │  ├─ submit-form.tsx         # ZIP / repo / paste
│  │  ├─ analysis-progress.tsx   # Skeleton-загрузчик ИИ
│  │  └─ review/
│  │     ├─ review-workspace.tsx # Панель ревью
│  │     ├─ code-viewer.tsx      # Monaco + маркеры
│  │     └─ score-ring.tsx
│  ├─ lib/
│  │  ├─ ai/system-prompt.ts     # Академический промпт
│  │  ├─ ai/gemini.ts            # Клиент Gemini API
│  │  ├─ analyzer/static-engine.ts
│  │  ├─ analyzer/pipeline.ts    # Оркестратор
│  │  ├─ languages.ts, repo.ts, types.ts
│  └─ db/                        # Drizzle ORM (PostgreSQL)
├─ backend/                      # FastAPI + Docker sandbox
│  ├─ app/main.py                # REST API
│  ├─ app/sandbox.py             # Управление контейнерами
│  ├─ app/analyzers.py           # gcc / cppcheck / valgrind / ruff
│  ├─ app/gemini.py              # Серверная интеграция Gemini
│  ├─ app/prompts.py             # Системный промпт (Python-копия)
│  ├─ Dockerfile                 # Образ API
│  ├─ sandbox.Dockerfile         # Образ песочницы (toolchain)
│  └─ requirements.txt
├─ docker-compose.yml
├─ .env.example
└─ next.config.ts`;

const CODE_BLOCKS: Array<{ title: string; code: string }> = [
  {
    title: "1. Локальный запуск фронтенда",
    code: `git clone <repo> && cd syntaxray
cp .env.example .env.local
npm install
npx drizzle-kit push     # создать таблицы в PostgreSQL
npm run dev              # http://localhost:3000`,
  },
  {
    title: "2. Запуск бэкенда и песочницы",
    code: `# сборка образа песочницы с тулчейном C/C++/Python
docker build -t syntaxray/sandbox:latest -f backend/sandbox.Dockerfile backend

# поднять API + Postgres
docker compose up --build

# проверка
curl http://localhost:8000/health`,
  },
  {
    title: "3. Развёртывание на Vercel",
    code: `vercel link
vercel env add GEMINI_API_KEY production
vercel env add DATABASE_URL production
vercel env add SANDBOX_API_URL production   # URL вашего FastAPI-раннера
vercel --prod

# Ревью синхронное и может занять до 90 c:
# в vercel.json увеличен maxDuration для /api/submissions.`,
  },
  {
    title: "4. Контракт песочницы (FastAPI → Next.js)",
    code: `POST {SANDBOX_API_URL}/api/sandbox/analyze
Authorization: Bearer <SANDBOX_API_TOKEN>
{ "files": [ { "path": "main.c", "language": "c", "content": "..." } ] }

→ 200 { engine, toolchain[], metrics{...}, complexity{...}, findings[], log[] }`,
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Reveal>
        <h1 className="text-3xl font-semibold tracking-tight">Документация и развёртывание</h1>
        <p className="mt-2 text-slate-400">
          Архитектура SyntaxRay, переменные окружения, конфигурация Docker и публикация на Vercel.
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <section className="glass mt-8 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Архитектура</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Фронтенд на Next.js (App Router) публикуется на Vercel и хранит заявки в PostgreSQL через Drizzle ORM.
            Пайплайн ревью состоит из двух ступеней: детерминированной (песочница) и семантической (Gemini).
            Если <code className="font-mono text-ray-300">SANDBOX_API_URL</code> не задан, используется встроенный
            TypeScript-движок с тем же JSON-контрактом — платформа работает сразу после деплоя.
          </p>
          <pre className="mt-5 overflow-auto rounded-xl border border-white/10 bg-ink-950/70 p-4 font-mono text-[11.5px] leading-relaxed text-slate-400">
            {TREE}
          </pre>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="glass mt-6 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Переменные окружения</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Переменная</th>
                  <th className="px-4 py-2.5">Назначение</th>
                  <th className="px-4 py-2.5">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ENV_VARS.map(([name, purpose, status]) => (
                  <tr key={name}>
                    <td className="px-4 py-3 font-mono text-xs text-ray-300">{name}</td>
                    <td className="px-4 py-3 text-slate-400">{purpose}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Ключ Gemini читается только на сервере (<code className="font-mono">process.env.GEMINI_API_KEY</code>)
            и никогда не попадает в клиентский бандл: запросы к модели идут из route handler.
          </p>
        </section>
      </Reveal>

      {CODE_BLOCKS.map((block, i) => (
        <Reveal key={block.title} delay={0.12 + i * 0.04}>
          <section className="glass mt-6 rounded-2xl p-6">
            <h2 className="text-lg font-semibold">{block.title}</h2>
            <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-ink-950/70 p-4 font-mono text-[12px] leading-relaxed text-slate-300">
              {block.code}
            </pre>
          </section>
        </Reveal>
      ))}

      <Reveal delay={0.3}>
        <section className="glass mt-6 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Безопасность песочницы</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {[
              "network=none — контейнер полностью изолирован от сети;",
              "read-only rootfs + tmpfs на /tmp с noexec для промежуточных артефактов;",
              "cap_drop=ALL, no-new-privileges, непривилегированный пользователь uid 1000;",
              "лимиты: 1 CPU, 512 МБ RAM, pids-limit 64, wall-clock таймаут 20 с на файл;",
              "исходники монтируются read-only в /workspace, результат отдаётся в stdout как JSON.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-ray-400/70">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
