"""
SyntaxRay — управление Docker-песочницей.

Каждая заявка выполняется в одноразовом контейнере со следующими ограничениями:
  • network_mode="none"        — полная сетевая изоляция;
  • read_only=True + tmpfs     — неизменяемая корневая ФС, /tmp с noexec;
  • cap_drop=["ALL"]           — сброс всех capabilities;
  • security_opt=no-new-privileges;
  • mem_limit=512m, nano_cpus=1 CPU, pids_limit=64;
  • user="1000:1000"           — непривилегированный пользователь;
  • wall-clock timeout         — принудительное убийство контейнера.

Контейнер запускает /opt/syntaxray/run_analysis.py, который выполняет
gcc/clang-tidy/cppcheck/valgrind/ruff/radon и печатает JSON в stdout.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger("syntaxray.sandbox")

SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "syntaxray/sandbox:latest")
SANDBOX_TIMEOUT = int(os.getenv("SANDBOX_TIMEOUT", "60"))
MEM_LIMIT = os.getenv("SANDBOX_MEM_LIMIT", "512m")


def _safe_join(root: Path, relative: str) -> Path:
    """Защита от path traversal (../../etc/passwd) при распаковке архива."""
    target = (root / relative).resolve()
    if not str(target).startswith(str(root.resolve())):
        raise ValueError(f"Недопустимый путь в архиве: {relative}")
    return target


def materialize(files: list[dict[str, Any]]) -> Path:
    """Раскладывает файлы во временный каталог, который монтируется read-only."""
    workspace = Path(tempfile.mkdtemp(prefix="syntaxray-"))
    for item in files:
        target = _safe_join(workspace, item["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(item["content"], encoding="utf-8", errors="replace")
    return workspace


def run_in_container(workspace: Path) -> dict[str, Any]:
    """
    Запускает анализ в изолированном контейнере и возвращает JSON-отчёт.
    Требует доступа к docker.sock (в compose монтируется только для API-сервиса).
    """
    import docker  # импорт внутри функции, чтобы модуль оставался тестируемым
    from docker.errors import ContainerError, DockerException, ImageNotFound

    client = docker.from_env()
    try:
        raw = client.containers.run(
            image=SANDBOX_IMAGE,
            command=["python3", "/opt/syntaxray/run_analysis.py", "/workspace"],
            volumes={str(workspace): {"bind": "/workspace", "mode": "ro"}},
            working_dir="/workspace",
            network_mode="none",
            mem_limit=MEM_LIMIT,
            nano_cpus=1_000_000_000,
            pids_limit=64,
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            cap_drop=["ALL"],
            security_opt=["no-new-privileges"],
            user="1000:1000",
            remove=True,
            stderr=False,
            detach=False,
        )
        payload = raw.decode("utf-8", errors="replace").strip()
        return json.loads(payload[payload.index("{") :])
    except ImageNotFound:
        raise RuntimeError(
            f"Образ песочницы {SANDBOX_IMAGE} не найден. "
            f"Соберите его: docker build -t {SANDBOX_IMAGE} -f backend/sandbox.Dockerfile backend"
        )
    except ContainerError as exc:
        raise RuntimeError(f"Песочница завершилась с ошибкой: {exc}") from exc
    except DockerException as exc:
        raise RuntimeError(f"Docker недоступен: {exc}") from exc
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
