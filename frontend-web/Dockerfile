# Production Dockerfile for Web Frontend
# --- Builder stage ---
FROM node:24-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS builder

WORKDIR /opt/relab/frontend-web

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy config files
COPY astro.config.ts tsconfig.json ./

# Copy source code and build
COPY public/ ./public/
COPY src/ ./src/

# Accept BUILD_MODE argument
ARG BUILD_MODE=prod

COPY ".env.$BUILD_MODE" ".env.$BUILD_MODE"

RUN npm run build:$BUILD_MODE

# --- Production stage ---
FROM caddy:2-alpine

COPY --from=builder /opt/relab/frontend-web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
