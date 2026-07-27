FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ACCEPT_EULA=Y \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        ca-certificates \
        unixodbc \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && rm /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends msodbcsql17 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY agent/requirements.txt /app/agent/requirements.txt
COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/agent/requirements.txt \
    && pip install --no-cache-dir -r /app/backend/requirements.txt

COPY agent/main.py /app/agent/main.py
COPY agent/persistence.py /app/agent/persistence.py
COPY agent/extractors /app/agent/extractors
COPY agent/graph /app/agent/graph
COPY agent/knowledge /app/agent/knowledge
COPY agent/prompts /app/agent/prompts
COPY backend /app/backend
COPY shared /app/shared

RUN mkdir -p /app/.data/sessions /app/.data/conversations

WORKDIR /app/agent

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
