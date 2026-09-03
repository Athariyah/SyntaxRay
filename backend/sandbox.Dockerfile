# ─────────────────────────────────────────────────────────────
# Образ ПЕСОЧНИЦЫ: содержит компиляторы и статические анализаторы.
# Запускается одноразово, без сети, от непривилегированного пользователя.
#   docker build -t syntaxray/sandbox:latest -f backend/sandbox.Dockerfile backend
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Тулчейн C/C++ и статические анализаторы
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        clang \
        clang-tidy \
        cppcheck \
        valgrind \
        make \
    && rm -rf /var/lib/apt/lists/*

# Python-линтеры
RUN pip install --no-cache-dir ruff==0.9.2 radon==6.0.1

# Код анализатора (без FastAPI — внутри песочницы он не нужен)
WORKDIR /opt/syntaxray
COPY app/analyzers.py ./app/analyzers.py
COPY app/__init__.py ./app/__init__.py
COPY run_analysis.py ./run_analysis.py

# Непривилегированный пользователь
RUN useradd -u 1000 -m runner && chown -R runner:runner /opt/syntaxray
USER runner

WORKDIR /workspace
ENTRYPOINT ["python3", "/opt/syntaxray/run_analysis.py"]
CMD ["/workspace"]
