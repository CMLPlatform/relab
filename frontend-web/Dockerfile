# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

# Multi-target Dockerfile for the Astro web frontend
#   - `dev`     → hot-reload dev server (use with `docker compose watch`)
#   - `runtime` → caddy-served static build (default)

ARG WORKDIR=/opt/relab/frontend-web

# --- Shared deps stage ---
FROM node:24-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS deps

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

EXPOSE 8081

CMD ["pnpm", "run", "dev"]

# --- Build stage (prod static build) ---
FROM deps AS build

ARG WORKDIR
WORKDIR $WORKDIR

ENV CI=1

COPY tsconfig.json astro.config.ts ./
COPY public/ ./public/
COPY src/ ./src/

ARG BUILD_MODE=prod
COPY ".env.$BUILD_MODE" ".env.$BUILD_MODE"

RUN pnpm run build:$BUILD_MODE

# --- Runtime stage (default) ---
FROM caddy:2-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794 AS runtime

ARG WORKDIR

# Upgrade packages to get latest security patches (Caddy image is pretty minimal, so this is low-risk)
RUN apk upgrade --no-cache

COPY --link --from=build ${WORKDIR}/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
