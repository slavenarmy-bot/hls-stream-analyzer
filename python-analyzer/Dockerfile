# syntax=docker/dockerfile:1
# ============================================================
# Stage 1: Build dependencies (with compile tools)
# ============================================================
FROM python:3.12-slim AS builder

# Install build dependencies for PyAV (FFmpeg) and OpenCV
# --network=host tells BuildKit to use host network (fixes Coolify DNS)
RUN --network=host apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install Python packages into a virtual env for clean copy
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN --network=host pip install --no-cache-dir -r requirements.txt

# ============================================================
# Stage 2: Production runner
# ============================================================
FROM python:3.12-slim AS runner

# Install only runtime FFmpeg libraries (no build tools)
RUN --network=host apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system analyzer && \
    useradd --system --gid analyzer analyzer

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder --chown=analyzer:analyzer /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY --chown=analyzer:analyzer main.py ./
COPY --chown=analyzer:analyzer analyzer ./analyzer

USER analyzer

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 -qO /dev/null http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
