"""Точка входа FastAPI-сервиса для Vercel (сервис `backend`, см. vercel.json).

Vercel проксирует запросы `/api/backend/*` на этот сервис. В зависимости от
конфигурации прокси путь может приходить как с префиксом `/api/backend`,
так и без него — приложение поэтому смонтировано в обоих местах.
"""

import sys
from pathlib import Path

# Каталог backend/ (родитель api/) — в sys.path, чтобы `app.main`
# импортировался независимо от рабочей директории рантайма.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI

from app.main import app as core_app

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/backend", core_app)
app.mount("/", core_app)
