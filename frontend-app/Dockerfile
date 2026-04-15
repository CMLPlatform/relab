# syntax=docker/dockerfile:1.10

# Production Dockerfile for App Frontend (Expo)
# --- Build stage ---
FROM node:24-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS build

WORKDIR /opt/relab/frontend-app

ENV CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy source code
COPY app.json babel.config.js expo-env.d.ts tsconfig.json ./
COPY src/ ./src/

# Set the env file for this build mode (Expo reads .env by default)
ARG BUILD_MODE=production
COPY ".env.$BUILD_MODE" .env

RUN pnpm exec expo export -p web -c


# --- Runtime stage ---
FROM caddy:2-alpine@sha256:fce4f15aad23222c0ac78a1220adf63bae7b94355d5ea28eee53910624acedfa

# Default to the production API origin; staging overrides this at runtime.
ENV CSP_API_ORIGIN=https://api.cml-relab.org

COPY --link --from=build /opt/relab/frontend-app/dist /srv
COPY --link Caddyfile /etc/caddy/Caddyfile

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
