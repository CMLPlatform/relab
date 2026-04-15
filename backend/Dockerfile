# --- Builder stage ---
FROM ghcr.io/astral-sh/uv:0.11-python3.14-trixie-slim AS builder

# Set the working directory inside the container
WORKDIR /opt/relab/backend

# uv optimizations (see https://docs.astral.sh/uv/guides/integration/docker/#optimizations)
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

# Copy dependency files
COPY .python-version pyproject.toml uv.lock ./

# Install dependencies (see https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-editable --no-default-groups

# Copy application directory
COPY app/ app/

# Final sync with project code (see https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable --no-default-groups

# --- Final runtime stage ---
FROM python:3.14-slim@sha256:584e89d31009a79ae4d9e3ab2fba078524a6c0921cb2711d05e8bb5f628fc9b9

ARG WORKDIR=/opt/relab/backend
ARG APP_USER=appuser
ARG APP_UID=1001

RUN useradd -u $APP_UID -m $APP_USER

WORKDIR $WORKDIR

RUN mkdir -p data/uploads/files data/uploads/images \
    && chown -R $APP_USER:$APP_USER data \
    && chmod -R 0777 data/uploads

COPY --link --from=builder --chown=$APP_UID:$APP_UID $WORKDIR/.venv $WORKDIR/.venv
COPY --link --from=builder --chown=$APP_UID:$APP_UID $WORKDIR/app $WORKDIR/app

# spell-checker: ignore PYTHONUNBUFFERED
ENV PYTHONPATH=$WORKDIR \
    PYTHONUNBUFFERED=1 \
    PATH="$WORKDIR/.venv/bin:$PATH"

EXPOSE 8000

USER $APP_USER

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/live',timeout=5).status==200 else 1)"

# Run the FastAPI application. Trust forwarded headers only from explicitly allowed proxy IPs.
CMD ["sh", "-c", ".venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='${FORWARDED_ALLOW_IPS:-127.0.0.1}' --workers ${WEB_CONCURRENCY:-1}"]
