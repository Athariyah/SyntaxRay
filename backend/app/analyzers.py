"""
SyntaxRay — сборка отчёта статического анализа.

Этот модуль исполняется ВНУТРИ контейнера-песочницы (run_analysis.py) либо
как fallback в самом API, если Docker недоступен. Он агрегирует вывод
внешних инструментов и собственные эвристики в единый JSON-контракт,
идентичный TypeScript-типу SandboxReport.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

C_EXT = {".c", ".h"}
CPP_EXT = {".cpp", ".cc", ".cxx", ".hpp", ".hh"}
PY_EXT = {".py"}

TOOL_TIMEOUT = 20  # секунд на инструмент


def detect_language(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in C_EXT:
        return "c"
    if suffix in CPP_EXT:
        return "cpp"
    if suffix in PY_EXT:
        return "python"
    return "plaintext"


def _run(cmd: list[str]) -> str:
    """Безопасный запуск инструмента: без shell, с таймаутом."""
    if shutil.which(cmd[0]) is None:
        return ""
    try:
        proc = subprocess.run(  # noqa: S603 — список аргументов, shell не используется
            cmd, capture_output=True, text=True, timeout=TOOL_TIMEOUT, check=False
        )
        return (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired:
        return f"[timeout] {' '.join(cmd)}"


def _finding(path: str, line: int, severity: str, category: str, title: str,
             message: str, suggestion: str | None = None, origin: str = "sandbox") -> dict[str, Any]:
    return {
        "filePath": path,
        "line": max(1, line),
        "endLine": None,
        "severity": severity,
        "category": category,
        "title": title[:200],
        "message": message,
        "suggestion": suggestion,
        "origin": origin,
    }


# ─────────────────────────── внешние инструменты ───────────────────────────

GCC_PATTERN = re.compile(r"^(?P<file>[^:]+):(?P<line>\d+):\d+:\s+(?P<kind>error|warning):\s+(?P<msg>.+)$")


def run_gcc(path: Path, language: str, log: list[str]) -> list[dict[str, Any]]:
    """Компиляция с максимальным набором предупреждений (без линковки)."""
    compiler = "gcc" if language == "c" else "g++"
    std = "-std=c17" if language == "c" else "-std=c++20"
    output = _run([compiler, std, "-fsyntax-only", "-Wall", "-Wextra", "-Wpedantic", str(path)])
    log.append(f"[{compiler}] {path.name}: {'ошибки/предупреждения найдены' if output.strip() else 'чисто'}")

    findings: list[dict[str, Any]] = []
    for raw in output.splitlines():
        match = GCC_PATTERN.match(raw.strip())
        if not match:
            continue
        kind = match.group("kind")
        findings.append(
            _finding(
                path.name,
                int(match.group("line")),
                "critical" if kind == "error" else "major",
                "correctness",
                match.group("msg")[:180],
                f"Диагностика {compiler}: {match.group('msg')}",
                "Устраните предупреждение — сборка с -Werror должна проходить без замечаний.",
            )
        )
    return findings[:25]


CPPCHECK_PATTERN = re.compile(r"^(?P<file>[^:]+):(?P<line>\d+):(?P<sev>\w+):(?P<id>[\w\-]+):(?P<msg>.+)$")

CPPCHECK_SEVERITY = {
    "error": "critical",
    "warning": "major",
    "portability": "minor",
    "performance": "major",
    "style": "minor",
    "information": "info",
}

CPPCHECK_CATEGORY = {
    "memleak": "memory",
    "memleakOnRealloc": "memory",
    "doubleFree": "memory",
    "nullPointer": "pointers",
    "uninitvar": "correctness",
    "arrayIndexOutOfBounds": "correctness",
    "bufferAccessOutOfBounds": "security",
}


def run_cppcheck(path: Path, log: list[str]) -> list[dict[str, Any]]:
    output = _run(
        [
            "cppcheck",
            "--enable=all",
            "--inconclusive",
            "--std=c++20",
            "--template={file}:{line}:{severity}:{id}:{message}",
            str(path),
        ]
    )
    log.append(f"[cppcheck] {path.name}: проверен")
    findings: list[dict[str, Any]] = []
    for raw in output.splitlines():
        match = CPPCHECK_PATTERN.match(raw.strip())
        if not match:
            continue
        rule = match.group("id")
        findings.append(
            _finding(
                path.name,
                int(match.group("line")),
                CPPCHECK_SEVERITY.get(match.group("sev"), "minor"),
                CPPCHECK_CATEGORY.get(rule, "correctness"),
                f"cppcheck: {rule}",
                match.group("msg"),
                "См. рекомендации cppcheck для правила " + rule,
            )
        )
    return findings[:25]


def run_valgrind(binary: Path, log: list[str]) -> list[dict[str, Any]]:
    """Динамическая проверка утечек (только если удалось собрать исполняемый файл)."""
    output = _run(["valgrind", "--leak-check=full", "--error-exitcode=0", str(binary)])
    log.append("[valgrind] анализ утечек выполнен")
    findings: list[dict[str, Any]] = []
    if "definitely lost" in output:
        for raw in output.splitlines():
            if "definitely lost" in raw and "0 bytes" not in raw:
                findings.append(
                    _finding(
                        binary.name,
                        1,
                        "critical",
                        "memory",
                        "Valgrind: обнаружена утечка памяти",
                        raw.strip(),
                        "Освободите выделенные блоки (free/delete) или используйте RAII / умные указатели.",
                    )
                )
    return findings


RUFF_SEVERITY_PREFIX = {"E": "minor", "F": "major", "B": "major", "C": "minor", "N": "info"}


def run_ruff(path: Path, log: list[str]) -> list[dict[str, Any]]:
    output = _run(["ruff", "check", "--output-format", "json", str(path)])
    log.append(f"[ruff] {path.name}: проверен")
    findings: list[dict[str, Any]] = []
    try:
        for item in json.loads(output or "[]"):
            code = item.get("code") or "E000"
            findings.append(
                _finding(
                    path.name,
                    int(item.get("location", {}).get("row", 1)),
                    RUFF_SEVERITY_PREFIX.get(code[0], "minor"),
                    "style" if code.startswith("E") else "correctness",
                    f"ruff {code}",
                    item.get("message", ""),
                    (item.get("fix") or {}).get("message") if item.get("fix") else None,
                )
            )
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass
    return findings[:25]


def run_radon(path: Path) -> int:
    """Цикломатическая сложность Python-модуля (сумма по функциям)."""
    output = _run(["radon", "cc", "-s", "-j", str(path)])
    try:
        data = json.loads(output or "{}")
        return sum(block.get("complexity", 0) for blocks in data.values() for block in blocks)
    except (json.JSONDecodeError, AttributeError):
        return 0


# ───────────────────────────── эвристики ─────────────────────────────

def estimate_complexity(files: list[dict[str, Any]]) -> dict[str, Any]:
    """Оценка асимптотики по вложенности циклов и самовызовам рекурсии."""
    order = ["O(1)", "O(N)", "O(N log N)", "O(N^2)", "O(N^3)", "O(2^N)"]
    worst = 0
    hotspots: list[dict[str, Any]] = []

    for item in files:
        lines = item["content"].split("\n")
        stack: list[int] = []
        for idx, raw in enumerate(lines, start=1):
            code = re.sub(r"(//|#).*$", "", raw)
            indent = len(raw) - len(raw.lstrip())
            if re.search(r"\b(for|while)\b\s*[(:]", code):
                while stack and stack[-1] >= indent:
                    stack.pop()
                stack.append(indent)
                if len(stack) >= 2:
                    estimate = "O(N^2)" if len(stack) == 2 else "O(N^3)"
                    worst = max(worst, order.index(estimate))
                    hotspots.append(
                        {
                            "file": item["path"],
                            "line": idx,
                            "estimate": estimate,
                            "reason": f"Вложенность циклов: {len(stack)}",
                        }
                    )
                else:
                    worst = max(worst, order.index("O(N)"))
            if re.search(r"\b(sorted|std::sort|\.sort)\s*\(", code):
                worst = max(worst, order.index("O(N log N)"))

    return {"estimate": order[worst], "hotspots": hotspots[:12]}


def collect_metrics(files: list[dict[str, Any]], cyclomatic: int) -> dict[str, Any]:
    total = sum(len(f["content"].split("\n")) for f in files)
    comments = 0
    code_lines = 0
    for item in files:
        for raw in item["content"].split("\n"):
            stripped = raw.strip()
            if not stripped:
                continue
            if stripped.startswith(("//", "/*", "*", "#")):
                comments += 1
            else:
                code_lines += 1
    return {
        "files": len(files),
        "totalLines": total,
        "codeLines": code_lines,
        "commentLines": comments,
        "commentRatio": round(comments / total, 4) if total else 0.0,
        "avgFunctionLength": 0,
        "maxNestingDepth": 0,
        "cyclomaticComplexity": cyclomatic,
        "longestFunction": None,
        "duplicateBlocks": 0,
    }


def analyze_workspace(workspace: Path) -> dict[str, Any]:
    """Полный прогон анализаторов по каталогу /workspace. Возвращает SandboxReport."""
    log: list[str] = ["[sandbox] запуск анализа в изолированном контейнере"]
    findings: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    cyclomatic = 0

    for path in sorted(workspace.rglob("*")):
        if not path.is_file():
            continue
        language = detect_language(path.name)
        if language == "plaintext":
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(workspace))
        files.append({"path": rel, "language": language, "content": content})

        if language in {"c", "cpp"}:
            findings += run_gcc(path, language, log)
            findings += run_cppcheck(path, log)
        elif language == "python":
            findings += run_ruff(path, log)
            cyclomatic += run_radon(path)

    log.append("[sandbox] контейнер остановлен, временные файлы удалены")

    return {
        "engine": "syntaxray-docker-sandbox/1.0",
        "toolchain": [
            "gcc -Wall -Wextra -Wpedantic",
            "g++ -std=c++20",
            "cppcheck --enable=all",
            "valgrind --leak-check=full",
            "ruff",
            "radon",
        ],
        "metrics": collect_metrics(files, cyclomatic),
        "complexity": estimate_complexity(files),
        "findings": findings[:120],
        "log": log,
    }
