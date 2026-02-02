# ============================================================
# Stage 1: Build dependencies (with compile tools)
# ============================================================
FROM python:3.12-slim AS builder

# Install build dependencies for PyAV (FFmpeg) and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
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

RUN pip install --no-cache-dir -r requirements.txt

# ============================================================
# Stage 2: Get static FFmpeg binaries
# ============================================================
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

# ============================================================
# Stage 3: Production runner (no apt-get needed)
# ============================================================
FROM python:3.12-slim AS runner

# Copy static FFmpeg binaries (no apt-get required)
COPY --from=ffmpeg /ffmpeg /usr/local/bin/
COPY --from=ffmpeg /ffprobe /usr/local/bin/

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
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
