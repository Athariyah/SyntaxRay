#!/usr/bin/env python3
"""
Точка входа ВНУТРИ контейнера-песочницы.

Вызывается как:  python3 /opt/syntaxray/run_analysis.py /workspace
Печатает единственный JSON-объект (SandboxReport) в stdout.
Никаких сетевых обращений: контейнер запускается с network=none.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, "/opt/syntaxray")

from app.analyzers import analyze_workspace  # noqa: E402


def main() -> int:
    workspace = Path(sys.argv[1] if len(sys.argv) > 1 else "/workspace")
    if not workspace.is_dir():
        print(json.dumps({"error": f"Каталог {workspace} не найден"}))
        return 1
    report = analyze_workspace(workspace)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
