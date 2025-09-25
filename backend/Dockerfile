# --- Builder stage ---
FROM ghcr.io/astral-sh/uv:0.8-python3.13-trixie-slim AS builder

# Install git for custom dependencies (fastapi-users-db-sqlmodel)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    git \
    && apt-get dist-clean

# Set the working directory inside the container
WORKDIR /opt/relab/backend

# Create needed directories for logs and uploads
RUN mkdir -p logs data/uploads/files data/uploads/images

# uv optimizations (see https://docs.astral.sh/uv/guides/integration/docker/#optimizations)
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

# Copy dependency files
COPY .python-version pyproject.toml uv.lock ./

# Install dependencies (see https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-editable --no-default-groups --group=api

# Copy application directory
COPY app/ app/

# Final sync with project code (see https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable --no-default-groups --group=api 

# --- Final runtime stage ---
FROM python:3.13-slim

# Set up a non-root user
RUN useradd -m appuser

# Copy built app and environment from builder
COPY --from=builder --chown=appuser:appuser /opt/relab/backend /opt/relab/backend

WORKDIR /opt/relab/backend

# Set Python variables
ENV PYTHONPATH=/opt/relab/backend \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/relab/backend/.venv/bin:$PATH"

EXPOSE 8000

USER appuser

# Run the FastAPI application
CMD [".venv/bin/fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
