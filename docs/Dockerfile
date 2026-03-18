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

# Copy source files
COPY zensical.toml ./
COPY docs ./docs

# HACK: Replace the base URL in zensical.toml for staging builds to point to the staging docs site. This is needed until zensical support dynamic base URLs or environment variable substitution.
ARG BUILD_MODE=production
RUN if [ "$BUILD_MODE" = "staging" ]; then \
    sed -i 's#https://docs.cml-relab.org#https://docs-test.cml-relab.org#g' zensical.toml; \
    fi

# Build the static site with zensical
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
