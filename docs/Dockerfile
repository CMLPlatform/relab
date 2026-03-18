# --- Builder stage ---
FROM ghcr.io/astral-sh/uv:0.10-python3.14-trixie-slim AS builder

WORKDIR /opt/relab/docs

# uv optimizations
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install build dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --only-group build

COPY docs/ zensical.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv run zensical build --clean

# --- Final runtime ---
FROM ghcr.io/astral-sh/uv:0.10-python3.14-trixie-slim AS runtime
WORKDIR /opt/relab/docs

# Copy dependency files for runtime sync
COPY pyproject.toml uv.lock ./
# Install serve dependencies ONLY
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --only-group serve

# Copy built site and server script
COPY --from=builder /opt/relab/docs/site ./site
COPY main.py ./

EXPOSE 8000

# Use uvicorn to run the FastAPI server
CMD ["uv", "run", "uvicorn", "--host", "0.0.0.0", "--port", "8000", "main:app"]
