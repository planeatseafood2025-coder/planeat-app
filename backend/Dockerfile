FROM python:3.12-slim

WORKDIR /app

# curl สำหรับ healthcheck + ฟอนต์ไทย (Garuda) สำหรับ PDF
RUN apt-get update && apt-get install -y --no-install-recommends curl fonts-thai-tlwg && \
    rm -rf /var/lib/apt/lists/*

# non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

# ติดตั้ง dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
