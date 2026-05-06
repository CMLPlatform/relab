# syntax=docker/dockerfile:1

# Multi-target Dockerfile for the Expo frontend app
#   - `dev`     → Metro dev server (use with `docker compose watch`)
#   - `runtime` → caddy-served expo web export (default)

# spell-checker: ignore USEPOLLING
ARG WORKDIR=/opt/relab/app

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

# --- Dev stage (Metro dev server) ---
FROM deps AS dev

ARG WORKDIR
WORKDIR $WORKDIR

ENV CHOKIDAR_USEPOLLING=true \
    CHOKIDAR_INTERVAL=500 \
    WATCHPACK_POLLING=true

COPY . .

EXPOSE 8081

# Keep Metro's cache across restarts; use the explicit dev-clean task when we
# actually need a cold cache.
CMD ["pnpm", "exec", "expo", "start", "--port", "8081", "--web"]

# --- Build stage (expo web export) ---
FROM deps AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV CI=1

COPY app.json babel.config.js tsconfig.json ./
COPY src/ ./src/

ARG ENVIRONMENT=prod
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_WEBSITE_URL
ARG EXPO_PUBLIC_DOCS_URL
ENV ENVIRONMENT=${ENVIRONMENT} \
    EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} \
    EXPO_PUBLIC_WEBSITE_URL=${EXPO_PUBLIC_WEBSITE_URL} \
    EXPO_PUBLIC_DOCS_URL=${EXPO_PUBLIC_DOCS_URL}

RUN pnpm exec expo export -p web -c

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

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
