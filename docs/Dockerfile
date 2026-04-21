# syntax=docker/dockerfile:1.10

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

ARG BUILD_MODE=prod
ARG PUBLIC_SITE_URL
ENV BUILD_MODE=${BUILD_MODE}
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}

RUN pnpm run build:${BUILD_MODE}

# --- Runtime stage (default) ---
FROM caddy:2-alpine@sha256:fce4f15aad23222c0ac78a1220adf63bae7b94355d5ea28eee53910624acedfa AS runtime

ARG WORKDIR

COPY --link --from=build ${WORKDIR}/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/health || exit 1
