# ─────────────────────────────────────────────────────────────
# Образ FastAPI-раннера SyntaxRay.
# Сам API не компилирует пользовательский код: он лишь оркестрирует
# одноразовые контейнеры песочницы через смонтированный docker.sock.
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Минимальный тулчейн на случай fallback-анализа без Docker
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ cppcheck valgrind \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir ruff radon

COPY app ./app
COPY run_analysis.py ./run_analysis.py

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
