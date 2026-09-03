# SyntaxRay

**Платформа автоматизированного статического анализа и академического ИИ-ревью кода** для преподавателей
и организаторов ИТ-мероприятий. Поддерживаются C, C++ и Python 3.

В отличие от систем тестирования LeetCode-типа, SyntaxRay оценивает не «прошли ли тесты», а качество
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
cp .env.example .env.local
npm install
npx drizzle-kit push          # создать таблицы
npm run dev                   # http://localhost:3000
```

Бэкенд и песочница:

```bash
docker build -t syntaxray/sandbox:latest -f backend/sandbox.Dockerfile backend
docker compose up --build
curl http://localhost:8000/health     # {"status":"ok","docker":true,"gemini":true}
```

Затем укажите во фронтенде `SANDBOX_API_URL=http://localhost:8000`.

## 4. Переменные окружения

| Переменная | Назначение | Обязательна |
|---|---|---|
| `DATABASE_URL` | PostgreSQL (Neon / Supabase / Vercel Postgres) | да |
| `GEMINI_API_KEY` | Ключ Google AI Studio; читается только на сервере | для ИИ-ревью |
| `GEMINI_MODEL` | По умолчанию `gemini-2.5-flash` | нет |
| `SANDBOX_API_URL` | URL FastAPI-раннера с Docker-песочницей | нет |
| `SANDBOX_API_TOKEN` | Bearer-токен раннера | нет |
| `GITHUB_TOKEN` | Лимиты GitHub API при импорте репозиториев | нет |

Без `GEMINI_API_KEY` платформа не падает: она отдаёт детерминированный отчёт и помечает движок как
`heuristic-engine`. Достаточно добавить ключ в Vercel — ИИ-ревью включится мгновенно, без изменений кода.

## 5. Развёртывание на Vercel

```bash
vercel link
vercel env add DATABASE_URL production
vercel env add GEMINI_API_KEY production
vercel env add SANDBOX_API_URL production   # опционально
vercel --prod
```

`vercel.json` увеличивает `maxDuration` для `/api/submissions` до 120 c (ревью синхронное).
Для планов без длинных функций вынесите анализ в очередь или полностью на FastAPI-раннер.

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
