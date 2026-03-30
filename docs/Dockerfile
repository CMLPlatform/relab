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
    uv sync --locked --no-install-project

# Copy source files
COPY zensical.toml ./
COPY docs ./docs

# Inject the current year into the copyright string in zensical.toml
RUN sed -i "s/<year>/$(date +%Y)/g" zensical.toml

# HACK: Replace the base URL in zensical.toml for staging builds to point to the staging docs site. This is needed until zensical support dynamic base URLs or environment variable substitution.
ARG BUILD_MODE=prod
RUN if [ "$BUILD_MODE" = "staging" ]; then \
    sed -i 's#https://docs.cml-relab.org#https://docs-test.cml-relab.org#g' zensical.toml; \
    fi

# Build the static site with zensical
RUN --mount=type=cache,target=/root/.cache/uv \
    uv run zensical build --clean

# --- Final runtime ---
FROM caddy:2-alpine

COPY --from=builder /opt/relab/docs/site /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/health || exit 1
