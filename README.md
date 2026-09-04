# СинтексПруф

**Платформа автоматизированного статического анализа и академического ИИ-ревью кода** для преподавателей
и организаторов ИТ-мероприятий. Поддерживаются C, C++ и Python 3.

В отличие от систем тестирования LeetCode-типа, СинтексПруф оценивает не «прошли ли тесты», а качество
инженерного решения: утечки памяти, работу с указателями, фактическую асимптотическую сложность,
архитектурную декомпозицию и читаемость.

---

## 1. Архитектура

```
Браузер ──▶ Next.js (Vercel)  ──▶  /api/submissions (route handler, Node.js runtime)
                │                        │
                │                        ├──▶ PostgreSQL (Drizzle ORM): заявки, файлы, замечания
                │                        │
                │                        ├──▶ FastAPI Sandbox API ──▶ Docker (network=none)
                │                        │        gcc · g++ · clang-tidy · cppcheck · valgrind · ruff · radon
                │                        │
                │                        └──▶ Gemini API (системный промпт академического ревью)
                │
                └──▶ Monaco Editor: маркеры, glyph-полоса и inline-комментарии по строкам
```

Пайплайн двухступенчатый:

1. **Детерминированная ступень** — песочница возвращает `SandboxReport` (метрики, findings, лог компиляции).
   Если `SANDBOX_API_URL` не задан, используется встроенный TypeScript-движок
   (`src/lib/analyzer/static-engine.ts`) с тем же JSON-контрактом — платформа работает сразу после деплоя.
2. **Семантическая ступень** — Gemini получает пронумерованный код + отчёт песочницы и возвращает
   строгий JSON: оценки, разделы отчёта и замечания с привязкой к строкам.

## 2. Структура проекта

```
src/
├─ app/
│  ├─ page.tsx                     Лендинг
│  ├─ dashboard/page.tsx           Дашборд преподавателя (метрики, очередь проверок)
│  ├─ new/page.tsx                 Загрузка: .zip / GitHub / вставка кода
│  ├─ review/[publicId]/page.tsx   Ревью: Monaco + панель замечаний
│  ├─ docs/page.tsx                Документация и инструкции по деплою
│  └─ api/
│     ├─ health/route.ts
│     └─ submissions/[…]           Создание заявки, список, получение, удаление
├─ components/                     UI (Framer Motion, glassmorphism, skeletons)
├─ lib/
│  ├─ ai/system-prompt.ts          Академический системный промпт
│  ├─ ai/gemini.ts                 Клиент Gemini (server-only)
│  ├─ analyzer/static-engine.ts    Детерминированный анализ
│  ├─ analyzer/pipeline.ts         Оркестратор: песочница → Gemini → отчёт
│  └─ languages.ts · repo.ts · types.ts
└─ db/                             Drizzle ORM (submissions, review_files, findings)

backend/
├─ app/main.py                     FastAPI: /api/sandbox/analyze, /api/sandbox/upload, /api/review
├─ app/sandbox.py                  Запуск одноразовых Docker-контейнеров
├─ app/analyzers.py                gcc / cppcheck / valgrind / ruff / radon → SandboxReport
├─ app/gemini.py                   Серверная интеграция Gemini
├─ app/prompts.py                  Системный промпт (Python-копия)
├─ run_analysis.py                 Точка входа внутри песочницы
├─ Dockerfile                      Образ API
└─ sandbox.Dockerfile              Образ песочницы с тулчейном
```

## 3. Быстрый старт

```bash
npm install
npm run dev                   # http://localhost:3000
```

Сайт работает сразу: без `DATABASE_URL` подключается встроенная PGlite (PostgreSQL в Wasm),
данные лежат в `./.pglite`, а миграции из `./drizzle` применяются автоматически.

Для внешней PostgreSQL (Neon / Supabase / локальный контейнер):

```bash
cp .env.example .env.local    # прописать DATABASE_URL
npx drizzle-kit push          # создать таблицы во внешней БД
npm run dev
```

Изменили `src/db/schema.ts`? Обновите миграции: `npx drizzle-kit generate`.

Бэкенд и песочница:

```bash
docker build -t sinteksproof/sandbox:latest -f backend/sandbox.Dockerfile backend
docker compose up --build
curl http://localhost:8000/health     # {"status":"ok","docker":true,"gemini":true}
```

Затем укажите во фронтенде `SANDBOX_API_URL=http://localhost:8000`.

## 4. Переменные окружения

| Переменная | Назначение | Обязательна |
|---|---|---|
| `DATABASE_URL` | PostgreSQL (Neon / Supabase / Vercel Postgres); без неё — встроенная PGlite | только для внешней БД |
| `GEMINI_API_KEY` | Ключ Google AI Studio; читается только на сервере | для ИИ-ревью |
| `GEMINI_MODEL` | По умолчанию `gemini-2.5-flash` | нет |
| `SANDBOX_API_URL` | URL FastAPI-раннера с Docker-песочницей | нет |
| `SANDBOX_API_TOKEN` | Bearer-токен раннера | нет |
| `GITHUB_TOKEN` | Лимиты GitHub API при импорте репозиториев | нет |

Без `GEMINI_API_KEY` платформа не падает: она отдаёт детерминированный отчёт и помечает движок как
`heuristic-engine`. Достаточно добавить ключ в Vercel — ИИ-ревью включится мгновенно, без изменений кода.

## 5. Развёртывание на Vercel

На Vercel деплоится **только фронтенд (Next.js)** — проект собирается как обычное
Next.js-приложение, отдельный `vercel.json` для этого не требуется.
FastAPI-песочница на Vercel **не работает** (там нет Docker, `docker.sock` и тулчейна
gcc/cppcheck/valgrind): поднимите её отдельно (VPS / Render / Railway через
`docker compose`) и укажите URL через `SANDBOX_API_URL`, либо оставьте поле пустым —
тогда используется встроенный TypeScript-движок статического анализа.

```bash
vercel link
vercel env add DATABASE_URL production    # Neon / Supabase / Vercel Postgres
vercel env add GEMINI_API_KEY production  # опционально, для ИИ-ревью
vercel env add SANDBOX_API_URL production # опционально, URL внешнего раннера
vercel --prod
```

Что важно знать:

* Без `DATABASE_URL` данные хранятся во встроенной PGlite. Локально это каталог
  `./.pglite`, а на Vercel (файловая система read-only) — `/tmp`, поэтому после
  каждого холодного старта база пустая. Для production задайте `DATABASE_URL`
  и примените миграции: `npx drizzle-kit push`.
* Лимит `maxDuration` для `/api/submissions` (ревью синхронное) задан в коде роута
  (`export const maxDuration = 60`): 60 c — максимум тарифа Hobby. На Pro можно
  поднять до 300. Если ревью не укладывается в лимит — вынесите анализ в очередь
  или полностью на FastAPI-раннер.
* Не включайте в настройках проекта режим **Services** и не добавляйте в
  `vercel.json` секции `services` / объектные `rewrites` — это бета-режим
  микросервисов, без него деплой падает с ошибкой валидации `vercel.json`.

## 6. Безопасность песочницы

* `network_mode=none`, `read_only=true`, `tmpfs /tmp (noexec,nosuid,64m)`
* `cap_drop=ALL`, `no-new-privileges`, пользователь `uid 1000`
* `mem_limit=512m`, 1 CPU, `pids_limit=64`, таймаут инструмента 20 c
* исходники монтируются read-only, защита от path traversal при распаковке архива

## 7. Системный промпт

Полный текст — `src/lib/ai/system-prompt.ts` (и его Python-копия `backend/app/prompts.py`).
Промпт задаёт роль научного руководителя, шесть обязательных осей проверки (UB, память, асимптотика,
архитектура, читаемость, безопасность), шкалу 0–100 с фиксированными штрафами и строгую JSON-схему ответа,
включая требование не выдумывать номера строк.

## 8. Возможности для преподавателя и продаж

* **Антиплагиат** (`src/lib/similarity.ts`): шинглы нормализованного кода → коэффициент Жаккара.
  Дашборд показывает топ подозрительных пар, страница ревью — похожие работы. Порог 45%, топ-4 пары.
* **Аналитика группы** (`src/components/analytics.tsx`): гистограмма баллов, структура замечаний
  по серьёзности, топ категорий ошибок и тренд среднего балла — чистый SVG, без chart-библиотек.
* **Экспорт**: CSV-ведомость из дашборда (уважает фильтры), Markdown/JSON/ссылка/строка для ведомости
  со страницы ревью (`src/components/export-buttons.tsx`).
* **Чек-лист «Готовность к пересдаче»** (`src/components/fix-checklist.tsx`): прогресс исправлений
  с сохранением в localStorage — доводит ревью до реального исправления кода.
* **Живое демо на лендинге** (`src/components/live-demo.tsx`): тот же детерминированный движок
  (`runStaticAnalysis` — чистый TS без Node-зависимостей) выполняется в браузере посетителя,
  оценка пересчитывается при редактировании кода. Плюс ROI-калькулятор экономии кафедры.
* **Скорость навигации**: переходы между вкладками и табы ревью переключаются мгновенно —
  без блокирующего `AnimatePresence mode="wait"` и пружинных `layoutId` (CSS-анимация `page-in`,
  мемоизация подсчётов, облегчённые опции Monaco, скелетоны `loading.tsx`).
