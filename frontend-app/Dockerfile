# Production Dockerfile for App Frontend (Expo)
# --- Builder stage ---
FROM node:24-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS builder

WORKDIR /opt/relab/frontend-app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN corepack enable
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY app.json expo-env.d.ts tsconfig.json ./
COPY src/ ./src/

# Set the env file for this build mode (Expo reads .env by default)
ARG BUILD_MODE=production
COPY ".env.$BUILD_MODE" .env

RUN pnpm exec expo export -p web -c

# --- Production stage ---
FROM caddy:2-alpine

# Default to the production API origin; staging overrides this at runtime.
ENV CSP_API_ORIGIN=https://api.cml-relab.org

COPY --from=builder /opt/relab/frontend-app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
