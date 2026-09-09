# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

# Multi-target Dockerfile for the Backend
#   - `dev`     → hot-reload dev image (all groups synced)
#   - `runtime` → slim prod image (default)

ARG WORKDIR=/opt/relab/backend

# --- Build stage (prod deps only) ---
FROM ghcr.io/astral-sh/uv:0.12-python3.14-trixie-slim@sha256:d5ddd498c5a28ec77ff1c70276f8f3c4a116a303c8b5583a018ea43c2e89e366 AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

COPY .python-version pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-editable --no-default-groups

COPY app/ app/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable --no-default-groups

# PyPI wheels ship unstripped; this cuts ~40MB from the venv the runtime stage
# copies. Only C-level crash backtraces lose detail, not Python tracebacks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends binutils \
    && find .venv -name '*.so' -exec strip -s {} + \
    && rm -rf /var/lib/apt/lists/*

# --- Dev stage (all groups, hot reload) ---
FROM ghcr.io/astral-sh/uv:0.12-python3.14-trixie-slim@sha256:d5ddd498c5a28ec77ff1c70276f8f3c4a116a303c8b5583a018ea43c2e89e366 AS dev

ARG WORKDIR
WORKDIR $WORKDIR

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

COPY .python-version pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups --group=dev --no-install-project --no-editable

# Named explicitly rather than `COPY . .`: under `just dev` compose's watch
# syncs ./backend over this anyway, so the snapshot only serves `just dev-up`.
# An explicit list lets this build take an allowlist ignore file, which fails
# loudly on a missing path instead of quietly absorbing whatever is in the tree.
COPY alembic/ alembic/
COPY app/ app/
COPY scripts/ scripts/
COPY data/seed/ data/seed/

RUN mkdir -p logs data/uploads/files data/uploads/images \
    && chmod -R 0775 data/uploads

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=$WORKDIR \
    PYTHONUNBUFFERED=1 \
    PATH="$WORKDIR/.venv/bin:$PATH"

EXPOSE 8000

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "app"]

# --- Runtime stage (default) ---
FROM python:3.14-slim-trixie@sha256:cad9a2c871761c413caa6fdd6441c783451e740a48aaeba60ae62a8b53525ef6 AS runtime

ARG WORKDIR
ARG APP_USER=appuser
ARG APP_UID=65532

RUN groupadd --gid "$APP_UID" "$APP_USER" && useradd --create-home --uid "$APP_UID" --gid "$APP_UID" --shell /usr/sbin/nologin "$APP_USER" \
    # This stage runs only the uv-built venv copied in below, so the base image's
    # own pip is dead weight: unused at runtime, and its vendored dependencies
    # keep surfacing in image scans. Drop it.
    && pip uninstall --yes --quiet pip

WORKDIR $WORKDIR

RUN install -d -o "$APP_UID" -g 0 -m 0775 \
    data/uploads \
    data/uploads/files \
    data/uploads/images

COPY --link --from=build --chown=$APP_UID:$APP_UID $WORKDIR/.venv $WORKDIR/.venv
COPY --link --from=build --chown=$APP_UID:$APP_UID $WORKDIR/app $WORKDIR/app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=$WORKDIR \
    PYTHONUNBUFFERED=1 \
    PATH="$WORKDIR/.venv/bin:$PATH"

EXPOSE 8000

USER $APP_USER

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/live',timeout=5).status==200 else 1)"

# UVICORN_* env vars below are read directly by the uvicorn CLI, not through app
# Settings; this CMD line is their single source of truth.
CMD ["sh", "-c", ".venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='${FORWARDED_ALLOW_IPS:-127.0.0.1}' --no-server-header --workers ${WEB_CONCURRENCY:-1} --limit-concurrency ${UVICORN_LIMIT_CONCURRENCY:-100} --timeout-keep-alive ${UVICORN_TIMEOUT_KEEP_ALIVE:-5} --h11-max-incomplete-event-size ${UVICORN_H11_MAX_INCOMPLETE_EVENT_SIZE:-16384} --ws-max-size ${RPI_CAM_WS_BINARY_FRAME_LIMIT_BYTES:-10485760} --ws-max-queue ${UVICORN_WS_MAX_QUEUE:-8} --ws-per-message-deflate false"]
