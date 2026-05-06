# syntax=docker/dockerfile:1@sha256:2780b5c3bab67f1f76c781860de469442999ed1a0d7992a5efdf2cffc0e3d769

# Multi-target Dockerfile for the Backend
#   - `dev`     → hot-reload dev image (all groups synced)
#   - `runtime` → slim prod image (default)

ARG WORKDIR=/opt/relab/backend

# --- Build stage (prod deps only) ---
FROM ghcr.io/astral-sh/uv:0.11-python3.14-trixie-slim@sha256:3e70f580d0e63d78408c35d332d780024b6e1d46d9744c888e22fa944393448e AS build

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

# --- Dev stage (all groups, hot reload) ---
FROM ghcr.io/astral-sh/uv:0.11-python3.14-trixie-slim@sha256:3e70f580d0e63d78408c35d332d780024b6e1d46d9744c888e22fa944393448e AS dev

ARG WORKDIR
WORKDIR $WORKDIR

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

COPY .python-version pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups --group=dev --no-install-project --no-editable

COPY . .

RUN mkdir -p logs data/uploads/files data/uploads/images \
    && chmod -R 0775 data/uploads

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=$WORKDIR \
    PYTHONUNBUFFERED=1 \
    PATH="$WORKDIR/.venv/bin:$PATH"

EXPOSE 8000

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "app"]

# --- Runtime stage (default) ---
FROM python:3.14-slim-trixie@sha256:5b3879b6f3cb77e712644d50262d05a7c146b7312d784a18eff7ff5462e77033 AS runtime

ARG WORKDIR
ARG APP_USER=appuser
ARG APP_UID=1001

RUN useradd --create-home --uid "$APP_UID" --shell /usr/sbin/nologin "$APP_USER"

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

CMD ["sh", "-c", ".venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='${FORWARDED_ALLOW_IPS:-127.0.0.1}' --workers ${WEB_CONCURRENCY:-1}"]
