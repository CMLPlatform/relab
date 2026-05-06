# syntax=docker/dockerfile:1

# Multi-target Dockerfile for the Astro Starlight docs site
#   - `dev`     → hot-reload dev server (use with `docker compose watch`)
#   - `runtime` → caddy-served static build (default)

ARG WORKDIR=/opt/relab/docs

# --- Shared deps stage ---
FROM node:24-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS deps

ARG WORKDIR
WORKDIR $WORKDIR

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# --- Dev stage (hot reload) ---
FROM deps AS dev

ARG WORKDIR
WORKDIR $WORKDIR

COPY . .

EXPOSE 8000

CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8000"]

# --- Build stage (prod static build) ---
FROM deps AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV CI=1

COPY astro.config.mjs tsconfig.json ./
COPY public/ ./public/
COPY src/ ./src/

ARG ENVIRONMENT=prod
ARG PUBLIC_DOCS_URL
ARG PUBLIC_BACKEND_API_URL
ENV ENVIRONMENT=${ENVIRONMENT}
ENV PUBLIC_DOCS_URL=${PUBLIC_DOCS_URL}
ENV PUBLIC_BACKEND_API_URL=${PUBLIC_BACKEND_API_URL}

RUN pnpm run build:${ENVIRONMENT}

# --- Runtime stage (default) ---
FROM caddy:2-alpine@sha256:834468128c7696cec0ceea6172f7d692daf645ae51983ca76e39da54a97c570d AS runtime

ARG WORKDIR

# Upgrade packages to get latest security patches (Caddy image is pretty minimal, so this is low-risk).
# RELab serves Caddy on high ports, so remove the inherited low-port bind capability
# to work with no-new-privileges and dropped runtime capabilities.
RUN apk upgrade --no-cache \
    && apk add --no-cache libcap \
    && setcap -r /usr/bin/caddy \
    && apk del libcap \
    && install -d -o 1001 -g 1001 /config /data

COPY --link --from=build ${WORKDIR}/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

USER 1001:1001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/health || exit 1
