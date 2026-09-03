"""
SyntaxRay — серверная интеграция с Gemini API.

Ключ читается ТОЛЬКО из переменной окружения GEMINI_API_KEY.
В Docker-развёртывании передавайте его через env_file / secrets,
никогда не зашивайте в образ.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from .prompts import SYNTAXRAY_SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("syntaxray.gemini")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
REQUEST_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "90"))

VALID_SEVERITY = {"critical", "major", "minor", "info"}
VALID_CATEGORY = {
    "memory", "pointers", "complexity", "architecture",
    "readability", "security", "style", "correctness",
}


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _parse_json_block(text: str) -> dict[str, Any]:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _clamp(value: Any, default: int = 70) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return default


def _normalize(payload: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    """Валидация ответа модели и защита от несуществующих номеров строк."""
    limits = {f["path"]: len(f["content"].split("\n")) for f in files}
    default_path = files[0]["path"] if files else "project"

    findings = []
    for item in payload.get("findings", [])[:25]:
        path = item.get("filePath") if item.get("filePath") in limits else default_path
        max_line = limits.get(path, 1)
        line = max(1, min(max_line, int(item.get("line") or 1)))
        findings.append(
            {
                "filePath": path,
                "line": line,
                "endLine": item.get("endLine"),
                "severity": item.get("severity") if item.get("severity") in VALID_SEVERITY else "minor",
                "category": item.get("category") if item.get("category") in VALID_CATEGORY else "style",
                "title": str(item.get("title", "Замечание"))[:200],
                "message": str(item.get("message", "")),
                "suggestion": item.get("suggestion"),
                "origin": "gemini",
            }
        )

    return {
        "score": _clamp(payload.get("score")),
        "readability": _clamp(payload.get("readability")),
        "architecture": _clamp(payload.get("architecture")),
        "complexity": str(payload.get("complexity", "O(N)"))[:48],
        "verdict": str(payload.get("verdict", "Хорошо"))[:48],
        "summary": str(payload.get("summary", "")),
        "strengths": [str(x) for x in payload.get("strengths", [])][:10],
        "risks": [str(x) for x in payload.get("risks", [])][:10],
        "actionItems": [str(x) for x in payload.get("actionItems", [])][:10],
        "sections": [
            {"title": str(s.get("title", "")), "body": str(s.get("body", ""))}
            for s in payload.get("sections", [])[:8]
        ],
        "findings": findings,
    }


async def review_with_gemini(
    title: str, language: str, files: list[dict[str, Any]], sandbox: dict[str, Any]
) -> dict[str, Any] | None:
    """Возвращает нормализованное ревью либо None (тогда используется отчёт песочницы)."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY не задан — семантическое ревью пропущено")
        return None

    body = {
        "systemInstruction": {"parts": [{"text": SYNTAXRAY_SYSTEM_PROMPT}]},
        "contents": [
            {"role": "user", "parts": [{"text": build_user_prompt(title, language, files, sandbox)}]}
        ],
        "generationConfig": {
            "temperature": 0.25,
            "topP": 0.9,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                GEMINI_ENDPOINT.format(model=GEMINI_MODEL),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                json=body,
            )
        if response.status_code != 200:
            logger.error("Gemini HTTP %s: %s", response.status_code, response.text[:400])
            return None
        candidates = response.json().get("candidates", [])
        text = "".join(p.get("text", "") for p in candidates[0]["content"]["parts"])
        return _normalize(_parse_json_block(text), files)
    except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.exception("Ошибка обращения к Gemini: %s", exc)
        return None
