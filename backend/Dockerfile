FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd --system --gid 10001 forensight \
    && useradd --system --uid 10001 --gid forensight --home-dir /home/forensight --create-home forensight \
    && mkdir -p /app/storage \
    && chown -R 10001:10001 /app /home/forensight

USER 10001:10001

# Run alembic migrations on start, then uvicorn
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
