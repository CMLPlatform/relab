# syntax=docker/dockerfile:1.10

# Production Dockerfile for Web Frontend
# --- Build stage ---
FROM node:24-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS build

WORKDIR /opt/relab/frontend-web

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN corepack enable
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy config files
COPY biome.json tsconfig.json ./

# Copy source code and build
COPY public/ ./public/
COPY src/ ./src/

# Accept BUILD_MODE argument
ARG BUILD_MODE=prod

COPY ".env.$BUILD_MODE" ".env.$BUILD_MODE"

RUN pnpm run build:$BUILD_MODE

# --- Runtime stage ---
FROM caddy:2-alpine@sha256:fce4f15aad23222c0ac78a1220adf63bae7b94355d5ea28eee53910624acedfa

COPY --link --from=build /opt/relab/frontend-web/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
