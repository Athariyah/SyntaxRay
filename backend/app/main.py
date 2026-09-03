"""
SyntaxRay Sandbox API (FastAPI).

Эндпоинты:
  GET  /health                     — проверка живости и доступности Docker;
  POST /api/sandbox/analyze        — статический анализ набора файлов в контейнере;
  POST /api/sandbox/upload         — приём .zip-архива (multipart) и его анализ;
  POST /api/review                 — полный конвейер: песочница + ревью Gemini.

Запуск:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import io
import logging
import os
import zipfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .analyzers import analyze_workspace, detect_language
from .gemini import is_configured, review_with_gemini
from .sandbox import materialize, run_in_container

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("syntaxray.api")

MAX_FILES = 25
MAX_TOTAL_CHARS = 400_000
ALLOWED_SUFFIXES = {".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".py"}

app = FastAPI(
    title="SyntaxRay Sandbox API",
    version="1.0.0",
    description="Изолированный статический анализ и академическое ИИ-ревью кода на C/C++/Python.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─────────────────────────────── модели ───────────────────────────────

class SourceFile(BaseModel):
    path: str = Field(max_length=400)
    language: str = "plaintext"
    content: str


class AnalyzeRequest(BaseModel):
    files: list[SourceFile]


class ReviewRequest(AnalyzeRequest):
    title: str = "Без названия"
    language: str = "mixed"


# ────────────────────────────── авторизация ──────────────────────────────

async def verify_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Опциональная защита раннера bearer-токеном (SANDBOX_API_TOKEN)."""
    expected = os.getenv("SANDBOX_API_TOKEN")
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Недействительный токен")


# ─────────────────────────────── помощники ───────────────────────────────

def _validate(files: list[SourceFile]) -> list[dict[str, Any]]:
    if not files:
        raise HTTPException(status_code=400, detail="Список файлов пуст")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=413, detail=f"Слишком много файлов (>{MAX_FILES})")
    total = sum(len(f.content) for f in files)
    if total > MAX_TOTAL_CHARS:
        raise HTTPException(status_code=413, detail=f"Превышен лимит объёма ({total} символов)")
    return [
        {
            "path": f.path.lstrip("/"),
            "language": f.language if f.language != "plaintext" else detect_language(f.path),
            "content": f.content,
        }
        for f in files
    ]


def _analyze(files: list[dict[str, Any]]) -> dict[str, Any]:
    """Пытается выполнить анализ в Docker; при недоступности — локально в процессе."""
    workspace = materialize(files)
    try:
        return run_in_container(workspace)
    except RuntimeError as exc:
        logger.warning("Docker недоступен (%s) — локальный анализ", exc)
        report = analyze_workspace(workspace)
        report["log"].insert(0, f"[warn] контейнер не запущен: {exc}")
        report["engine"] = "syntaxray-inprocess/1.0"
        return report
    finally:
        import shutil

        shutil.rmtree(workspace, ignore_errors=True)


# ──────────────────────────────── роуты ────────────────────────────────

@app.get("/health")
async def health() -> dict[str, Any]:
    docker_ok = False
    try:
        import docker

        docker.from_env().ping()
        docker_ok = True
    except Exception:  # noqa: BLE001 — health не должен падать
        docker_ok = False
    return {"status": "ok", "docker": docker_ok, "gemini": is_configured()}


@app.post("/api/sandbox/analyze", dependencies=[Depends(verify_token)])
async def sandbox_analyze(payload: AnalyzeRequest) -> dict[str, Any]:
    """Детерминированный анализ. Контракт совпадает с TS-типом SandboxReport."""
    return _analyze(_validate(payload.files))


@app.post("/api/sandbox/upload", dependencies=[Depends(verify_token)])
async def sandbox_upload(archive: Annotated[UploadFile, File()]) -> dict[str, Any]:
    """Приём .zip-архива: распаковка в память, фильтрация и анализ."""
    if not (archive.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Ожидается .zip-архив")

    raw = await archive.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Архив больше 8 МБ")

    files: list[SourceFile] = []
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            for info in zf.infolist():
                if info.is_dir() or info.file_size > 200_000:
                    continue
                name = info.filename
                if ".." in name or name.startswith("/"):
                    continue
                if Path(name).suffix.lower() not in ALLOWED_SUFFIXES:
                    continue
                if any(part in {"node_modules", ".git", "__pycache__", "build"} for part in Path(name).parts):
                    continue
                content = zf.read(info).decode("utf-8", errors="replace")
                files.append(SourceFile(path=name, language=detect_language(name), content=content))
                if len(files) >= MAX_FILES:
                    break
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Повреждённый архив") from exc

    return _analyze(_validate(files))


@app.post("/api/review", dependencies=[Depends(verify_token)])
async def full_review(payload: ReviewRequest) -> dict[str, Any]:
    """Полный конвейер: изолированный анализ → академическое ревью Gemini."""
    files = _validate(payload.files)
    sandbox = _analyze(files)
    gemini = await review_with_gemini(payload.title, payload.language, files, sandbox)

    if gemini is None:
        return {"engine": sandbox["engine"], "sandbox": sandbox, "review": None}

    # Слияние: находки Gemini имеют приоритет, дубли по «файл:строка» убираются.
    seen = {(f["filePath"], f["line"]) for f in gemini["findings"]}
    merged = gemini["findings"] + [
        f for f in sandbox["findings"] if (f["filePath"], f["line"]) not in seen
    ]
    sandbox["findings"] = merged[:140]
    return {"engine": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), "sandbox": sandbox, "review": gemini}
