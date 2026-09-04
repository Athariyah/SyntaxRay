"""
СинтексПруф — интеграция с GigaChat (Сбер).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from typing import Any

import httpx

from .prompts import SINTEKSPROOF_SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("sinteksproof.gigachat")

GIGACHAT_MODEL = os.getenv("GIGACHAT_MODEL", "GigaChat")
GIGACHAT_BASE_URL = os.getenv("GIGACHAT_BASE_URL", "https://gigachat.devices.sberbank.ru/api/v1").rstrip("/")
GIGACHAT_AUTH_URL = os.getenv("GIGACHAT_AUTH_URL", "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
GIGACHAT_SCOPE = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
REQUEST_TIMEOUT = float(os.getenv("GIGACHAT_TIMEOUT", "90"))

VALID_SEVERITY = {"critical", "major", "minor", "info"}
VALID_CATEGORY = {"memory", "pointers", "complexity", "architecture", "readability", "security", "style", "correctness"}

_cached_token: dict[str, Any] | None = None
_token_expires: float = 0

def is_configured() -> bool:
    return bool(
        (os.getenv("GIGACHAT_AUTH_KEY") and len(os.getenv("GIGACHAT_AUTH_KEY", "")) > 10)
        or (os.getenv("GIGACHAT_CLIENT_ID") and os.getenv("GIGACHAT_CLIENT_SECRET"))
    )

def _get_auth_header() -> str | None:
    auth_key = os.getenv("GIGACHAT_AUTH_KEY")
    if auth_key:
        return f"Basic {auth_key}"
    cid = os.getenv("GIGACHAT_CLIENT_ID")
    cs = os.getenv("GIGACHAT_CLIENT_SECRET")
    if cid and cs:
        return f"Basic {base64.b64encode(f'{cid}:{cs}'.encode()).decode()}"
    return None

async def _get_token() -> str | None:
    global _cached_token, _token_expires
    import time
    if _cached_token and time.time() < _token_expires - 60:
        return _cached_token.get("access_token")
    hdr = _get_auth_header()
    if not hdr:
        return None
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, verify=False) as client:
            resp = await client.post(
                GIGACHAT_AUTH_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "RqUID": str(uuid.uuid4()),
                    "Authorization": hdr,
                },
                data={"scope": GIGACHAT_SCOPE},
            )
        if resp.status_code != 200:
            logger.error("Gigachat oauth %s: %s", resp.status_code, resp.text[:500])
            return None
        data = resp.json()
        tok = data.get("access_token")
        if tok:
            _cached_token = data
            _token_expires = time.time() + int(data.get("expires_in", 1800))
        return tok
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gigachat oauth failed: %s", exc)
        return None

def _parse(text: str) -> dict[str, Any]:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        s, e = cleaned.find("{"), cleaned.rfind("}")
        if s >= 0 and e > s:
            return json.loads(cleaned[s:e+1])
        raise

def _clamp(v: Any, d: int = 70) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except Exception:
        return d

def _normalize(payload: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    limits = {f["path"]: len(f["content"].split("\n")) for f in files}
    default = files[0]["path"] if files else "project"
    findings = []
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
            "title": str(item.get("title", "Замечание"))[:200],
            "message": str(item.get("message", "")),
            "suggestion": item.get("suggestion"),
            "origin": "gemini",
        })
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
        "sections": [{"title": str(s.get("title","")), "body": str(s.get("body",""))} for s in payload.get("sections",[])[:8]],
        "findings": findings,
    }

async def review_with_gigachat(title: str, language: str, files: list[dict[str, Any]], sandbox: dict[str, Any]) -> dict[str, Any] | None:
    if not is_configured():
        return None
    token = await _get_token()
    if not token:
        return None
    body = {
        "model": GIGACHAT_MODEL,
        "messages": [
            {"role": "system", "content": SINTEKSPROOF_SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(title, language, files, sandbox)},
        ],
        "temperature": 0.25,
        "top_p": 0.9,
        "max_tokens": 8192,
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, verify=False) as client:
            resp = await client.post(
                f"{GIGACHAT_BASE_URL}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                json=body,
            )
        if resp.status_code != 200:
            logger.error("Gigachat %s: %s", resp.status_code, resp.text[:600])
            return None
        choices = resp.json().get("choices", [])
        text = choices[0].get("message", {}).get("content", "") if choices else ""
        if not text.strip():
            return None
        return _normalize(_parse(text), files)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gigachat error: %s", exc)
        return None
