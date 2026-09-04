"""
СинтексПруф — интеграция с YandexGPT (Yandex Cloud).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from .prompts import SINTEKSPROOF_SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("sinteksproof.yandexgpt")

REQUEST_TIMEOUT = float(os.getenv("YANDEX_TIMEOUT", "90"))

def is_configured() -> bool:
    return bool((os.getenv("YANDEX_API_KEY") or os.getenv("YANDEXGPT_API_KEY")) and os.getenv("YANDEX_FOLDER_ID"))

def _clamp(v: Any, d: int = 70) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except Exception:
        return d

def _parse(text: str) -> dict[str, Any]:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        s, e = cleaned.find("{"), cleaned.rfind("}")
        if s >= 0 and e > s:
            return json.loads(cleaned[s:e+1])
        raise

VALID_SEVERITY = {"critical", "major", "minor", "info"}
VALID_CATEGORY = {"memory","pointers","complexity","architecture","readability","security","style","correctness"}

def _normalize(payload: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    limits = {f["path"]: len(f["content"].split("\n")) for f in files}
    default = files[0]["path"] if files else "project"
    findings=[]
    for item in payload.get("findings", [])[:25]:
        path = item.get("filePath") if item.get("filePath") in limits else default
        max_line = limits.get(path, 1)
        line = max(1, min(max_line, int(item.get("line") or 1)))
        findings.append({
            "filePath": path,
            "line": line,
            "endLine": item.get("endLine"),
            "severity": item.get("severity") if item.get("severity") in VALID_SEVERITY else "minor",
            "category": item.get("category") if item.get("category") in VALID_CATEGORY else "style",
            "title": str(item.get("title","Замечание"))[:200],
            "message": str(item.get("message","")),
            "suggestion": item.get("suggestion"),
            "origin": "gemini",
        })
    return {
        "score": _clamp(payload.get("score")),
        "readability": _clamp(payload.get("readability")),
        "architecture": _clamp(payload.get("architecture")),
        "complexity": str(payload.get("complexity","O(N)"))[:48],
        "verdict": str(payload.get("verdict","Хорошо"))[:48],
        "summary": str(payload.get("summary","")),
        "strengths": [str(x) for x in payload.get("strengths", [])][:10],
        "risks": [str(x) for x in payload.get("risks", [])][:10],
        "actionItems": [str(x) for x in payload.get("actionItems", [])][:10],
        "sections": [{"title": str(s.get("title","")), "body": str(s.get("body",""))} for s in payload.get("sections",[])[:8]],
        "findings": findings,
    }

async def review_with_yandexgpt(title: str, language: str, files: list[dict[str, Any]], sandbox: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.getenv("YANDEX_API_KEY") or os.getenv("YANDEXGPT_API_KEY")
    folder = os.getenv("YANDEX_FOLDER_ID")
    model = os.getenv("YANDEXGPT_MODEL", "yandexgpt")
    if not api_key or not folder:
        return None
    model_uri = f"gpt://{folder}/{model}/latest"
    body = {
        "modelUri": model_uri,
        "completionOptions": {"stream": False, "temperature": 0.25, "maxTokens": "8192"},
        "messages": [
            {"role": "system", "text": SINTEKSPROOF_SYSTEM_PROMPT},
            {"role": "user", "text": build_user_prompt(title, language, files, sandbox)},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(
                "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
                headers={"Content-Type":"application/json","Authorization": f"Api-Key {api_key}", "x-folder-id": folder},
                json=body,
            )
        if resp.status_code != 200:
            logger.error("YandexGPT %s: %s", resp.status_code, resp.text[:600])
            return None
        alt = resp.json().get("result", {}).get("alternatives", [])
        text = alt[0].get("message", {}).get("text", "") if alt else ""
        if not text.strip():
            return None
        return _normalize(_parse(text), files)
    except Exception as exc:  # noqa: BLE001
        logger.exception("YandexGPT error: %s", exc)
        return None
