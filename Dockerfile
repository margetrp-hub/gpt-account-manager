FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MAIL_PICKUP_HOST=0.0.0.0 \
    MAIL_PICKUP_PORT=8765 \
    MAIL_PICKUP_NODE_BIN=node

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && python -m pip install --no-cache-dir PySocks

COPY . .
RUN mkdir -p /app/data /app/.cache

EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8765/ >/dev/null || exit 1

CMD ["python", "/app/server.py"]
