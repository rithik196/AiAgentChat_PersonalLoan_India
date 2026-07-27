FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TEMPORAL_ADDRESS=temporal:7233

WORKDIR /app

COPY workflow/requirements.txt /app/workflow/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/workflow/requirements.txt

COPY workflow/worker.py /app/workflow/worker.py
COPY workflow/signals.py /app/workflow/signals.py
COPY workflow/activities /app/workflow/activities
COPY workflow/workflows /app/workflow/workflows
COPY shared /app/shared

CMD ["python", "-m", "workflow.worker"]
