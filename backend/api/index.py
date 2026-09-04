"""Точка входа FastAPI-сервиса для Vercel (@vercel/python).

Vercel ищет ASGI-приложение в переменной `app` внутри каталога `api/`.
Ядро API живёт в `app.main`; здесь мы переиспользуем его напрямую и лишь
срезаем возможный префикс `/api/backend` (если в проекте настроен rewrite
`/api/backend/* → /api/*`), чтобы работали оба варианта пути:

  /health                  и  /api/backend/health
  /api/sandbox/analyze     и  /api/backend/api/sandbox/analyze

Обратите внимание: полноценная Docker-песочница на Vercel недоступна
(нет docker.sock и тулчейна), поэтому без внешнего раннера API
автоматически деградирует до встроенного анализа (см. app/main.py).
Для полного цикла поднимите раннер отдельно (VPS / Render / Railway)
и укажите его URL во фронтенде через SANDBOX_API_URL.
"""

import sys
from pathlib import Path

# Каталог backend/ (родитель api/) — в sys.path, чтобы `app.main`
# импортировался независимо от рабочей директории рантайма.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.main import app as core_app  # noqa: E402

PREFIX = "/api/backend"


async def _strip_prefix_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Срезает префикс /api/backend перед маршрутизацией ядра."""
    if request.url.path == PREFIX or request.url.path.startswith(PREFIX + "/"):
        stripped = request.url.path[len(PREFIX):] or "/"
        request.scope["path"] = stripped
        request.scope["raw_path"] = stripped.encode("latin-1")
    return await call_next(request)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(404)
async def _not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse({"detail": "Не найдено"}, status_code=404)


app.middleware("http")(_strip_prefix_middleware)
app.mount("/", core_app)
